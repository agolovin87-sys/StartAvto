/**
 * Push (FCM): входящие сообщения, запись/вождение, окна, талоны.
 * Деплой: cd functions && npm i && cd .. && firebase deploy --only functions
 */
const admin = require("firebase-admin");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");

setGlobalOptions({ region: "europe-west1", maxInstances: 10 });

/** Ключ API Яндекс Локатора: firebase functions:secrets:set YANDEX_LOCATOR_API_KEY */
const yandexLocatorApiKey = defineSecret("YANDEX_LOCATOR_API_KEY");

admin.initializeApp();
const db = admin.firestore();

function tsMillis(v) {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

/** Токены веб-push из подколлекции users/{uid}/fcmTokens (документ → ref для удаления просроченных). */
async function tokenDocRefsForUser(uid) {
  const u = (uid ?? "").trim();
  if (!u) return [];
  const snap = await db.collection("users").doc(u).collection("fcmTokens").get();
  return snap.docs
    .map((d) => ({ token: d.data().token, ref: d.ref }))
    .filter((x) => typeof x.token === "string" && x.token.length > 40);
}

const FCM_STALE_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

async function sendToUsers(uids, title, body, data = {}) {
  const uidSet = [...new Set((uids ?? []).map((x) => (x ?? "").trim()).filter(Boolean))];
  /** Один токен — один ref (при дубликатах оставляем первый). */
  const tokenToRef = new Map();
  for (const uid of uidSet) {
    for (const { token, ref } of await tokenDocRefsForUser(uid)) {
      if (!tokenToRef.has(token)) tokenToRef.set(token, ref);
    }
  }
  const tokens = [...tokenToRef.keys()];
  if (tokens.length === 0) return;

  const dataPayload = {};
  for (const [k, v] of Object.entries(data)) {
    dataPayload[k] = v == null ? "" : String(v);
  }
  /** Только data: иначе на Web дважды — авто-показ по `notification` + showNotification в SW. */
  dataPayload.title = title == null ? "" : String(title);
  dataPayload.body = body == null ? "" : String(body);

  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    data: dataPayload,
  });

  const staleRefs = [];
  res.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code || "";
    if (FCM_STALE_CODES.has(code)) {
      const ref = tokenToRef.get(tokens[i]);
      if (ref) staleRefs.push(ref);
    }
  });
  await Promise.all(staleRefs.map((r) => r.delete().catch(() => {})));

  const failed = res.responses.filter((x) => !x.success);
  if (failed.length > 0) {
    console.warn("[FCM]", title, `failed ${failed.length}/${tokens.length}`, failed[0].error?.code);
  }
}

function clientIpFromRequest(raw) {
  if (!raw || !raw.headers) return "";
  const xff = raw.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0].trim();
  }
  const xri = raw.headers["x-real-ip"];
  if (typeof xri === "string" && xri.trim()) return xri.trim();
  const s = raw.socket && raw.socket.remoteAddress;
  if (typeof s === "string" && s.startsWith("::ffff:")) return s.slice(7);
  return typeof s === "string" ? s : "";
}

function messagePreview(data) {
  const type = typeof data.type === "string" ? data.type : "text";
  const text = typeof data.text === "string" ? data.text.trim().replace(/\s+/g, " ") : "";
  if (type === "text") return text.length > 100 ? `${text.slice(0, 97)}…` : text || "Сообщение";
  if (type === "voice") return "Голосовое сообщение";
  if (type === "image") return "Фото";
  if (type === "file") {
    const fn = typeof data.fileName === "string" ? data.fileName.trim() : "";
    return fn ? `Файл: ${fn}` : "Файл";
  }
  return "Сообщение";
}

async function displayNameForUser(uid) {
  const u = (uid ?? "").trim();
  if (!u) return "Контакт";
  try {
    const snap = await db.collection("users").doc(u).get();
    if (!snap.exists) return "Контакт";
    const dn = snap.data().displayName;
    if (typeof dn === "string" && dn.trim()) return dn.trim();
  } catch (e) {
    console.warn("[FCM] displayNameForUser", e);
  }
  return "Контакт";
}

/** Как formatShortFio на клиенте: «Иванов Иван» → «Иванов И.». */
function formatShortFioFromFullName(full) {
  const parts = String(full ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0];
  const surname = parts[0];
  const initials = parts
    .slice(1)
    .map((p) => `${String(p[0] || "?").toUpperCase()}.`)
    .join("");
  return `${surname} ${initials}`;
}

async function listAdminUids() {
  const snap = await db.collection("users").where("role", "==", "admin").get();
  return snap.docs.map((d) => d.id);
}

/**
 * Яндекс Локатор по IP клиента (Wi‑Fi/cell в браузере недоступны).
 * Вызывается только активными инструкторами; ключ не уходит на клиент.
 */
exports.locatorLocate = onCall(
  {
    region: "europe-west1",
    secrets: [yandexLocatorApiKey],
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError("unauthenticated", "Нужна авторизация");
    }
    const uid = request.auth.uid.trim();
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError("permission-denied", "Профиль не найден");
    }
    const u = userSnap.data();
    if (u.role !== "instructor" || u.accountStatus !== "active") {
      throw new HttpsError("permission-denied", "Только для активных инструкторов");
    }

    const ip = clientIpFromRequest(request.rawRequest);
    if (!ip) {
      throw new HttpsError("failed-precondition", "Не удалось определить IP для Локатора");
    }

    const key = yandexLocatorApiKey.value();
    const url = `https://locator.api.maps.yandex.ru/v1/locate?apikey=${encodeURIComponent(key)}`;
    const body = { ip: [{ address: ip }] };

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "StartAvto/1.0 (Firebase; instructor)",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      console.warn("[locatorLocate] fetch", e);
      throw new HttpsError("unavailable", "Сеть Локатора недоступна");
    }

    if (!res.ok) {
      const text = await res.text();
      console.warn("[locatorLocate]", res.status, text.slice(0, 200));
      throw new HttpsError("unavailable", `Локатор: ${res.status}`);
    }

    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new HttpsError("internal", "Некорректный ответ Локатора");
    }

    const loc = data && data.location;
    const point = loc && loc.point;
    if (!point || typeof point.lat !== "number" || typeof point.lon !== "number") {
      return { ok: false };
    }
    const acc = typeof loc.accuracy === "number" && Number.isFinite(loc.accuracy) ? loc.accuracy : 5000;
    return {
      ok: true,
      lat: point.lat,
      lng: point.lon,
      accuracyM: Math.max(1, Math.min(500_000, acc)),
    };
  }
);

exports.onInstructorGpsSessionPingWritten = onDocumentWritten(
  "instructorGpsSessionPings/{instructorId}",
  async (event) => {
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!after) return;
    const instructorId = event.params.instructorId;
    const name = await displayNameForUser(instructorId);
    const label = formatShortFioFromFullName(name);
    const admins = await listAdminUids();
    if (admins.length === 0) return;
    await sendToUsers(
      admins,
      "Геолокация",
      `Доступны новые координаты инструктора ${label}.`,
      { kind: "instructor_gps", instructorId }
    );
  }
);

exports.onChatMessageCreated = onDocumentCreated(
  "chats/{chatId}/messages/{messageId}",
  async (event) => {
    const msg = event.data.data();
    const senderId = typeof msg.senderId === "string" ? msg.senderId.trim() : "";
    if (!senderId) return;

    const chatSnap = await db.collection("chats").doc(event.params.chatId).get();
    if (!chatSnap.exists) return;
    const ids = chatSnap.data().participantIds;
    if (!Array.isArray(ids)) return;

    const recipients = ids.filter((id) => typeof id === "string" && id.trim() && id.trim() !== senderId);
    if (recipients.length === 0) return;

    const senderLabel = await displayNameForUser(senderId);
    const preview = messagePreview(msg);
    await sendToUsers(recipients, senderLabel, preview, {
      kind: "chat",
      chatId: event.params.chatId,
    });
  }
);

exports.onDriveSlotCreated = onDocumentCreated("driveSlots/{slotId}", async (event) => {
  const d = event.data.data();
  const studentId = typeof d.studentId === "string" ? d.studentId.trim() : "";
  if (!studentId) return;
  const status = typeof d.status === "string" ? d.status : "";
  const dk = typeof d.dateKey === "string" ? d.dateKey : "";
  const st = typeof d.startTime === "string" ? d.startTime : "";

  if (status === "pending_confirmation") {
    await sendToUsers([studentId], "Запись на вождение", `Инструктор назначил занятие ${dk} ${st}. Подтвердите в приложении.`, {
      kind: "drive_booking",
      slotId: event.params.slotId,
    });
  } else if (status === "scheduled") {
    await sendToUsers([studentId], "Запись на вождение", `Вас записали на вождение ${dk} ${st}.`, {
      kind: "drive_scheduled",
      slotId: event.params.slotId,
    });
  }
});

exports.onDriveSlotUpdated = onDocumentUpdated("driveSlots/{slotId}", async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : {};
  const after = event.data.after.data();
  if (!after) return;

  const slotId = event.params.slotId;
  const studentId = typeof after.studentId === "string" ? after.studentId.trim() : "";
  const instructorId = typeof after.instructorId === "string" ? after.instructorId.trim() : "";
  const dk = typeof after.dateKey === "string" ? after.dateKey : "";
  const st = typeof after.startTime === "string" ? after.startTime : "";

  const bStatus = typeof before.status === "string" ? before.status : "";
  const aStatus = typeof after.status === "string" ? after.status : "";

  if (bStatus === "pending_confirmation" && aStatus === "scheduled" && instructorId) {
    await sendToUsers([instructorId], "Курсант подтвердил запись", `Занятие ${dk} ${st} подтверждено курсантом.`, {
      kind: "drive_student_confirmed_booking",
      slotId,
    });
  }

  const bAck = tsMillis(before.liveStudentAckAt);
  const aAck = tsMillis(after.liveStudentAckAt);
  if (bAck == null && aAck != null && instructorId) {
    await sendToUsers([instructorId], "Вождение", "Курсант подтвердил начало вождения.", {
      kind: "drive_student_ack",
      slotId,
    });
  }

  const bLive = tsMillis(before.liveStartedAt);
  const aLive = tsMillis(after.liveStartedAt);
  if (bLive == null && aLive != null && studentId) {
    await sendToUsers([studentId], "Подтвердите вождение", "Инструктор начал занятие — подтвердите начало в приложении.", {
      kind: "drive_need_ack",
      slotId,
    });
  }

  if (bStatus !== "completed" && aStatus === "completed" && studentId && instructorId) {
    await sendToUsers(
      [studentId, instructorId],
      "Вождение завершено",
      `Занятие ${dk} ${st} завершено.`,
      { kind: "drive_completed", slotId }
    );
  }

  if (bStatus !== "cancelled" && aStatus === "cancelled") {
    const by = after.cancelledByRole;
    if (by === "student" && instructorId) {
      await sendToUsers([instructorId], "Отмена вождения", `Курсант отменил занятие ${dk} ${st}.`, {
        kind: "drive_cancelled",
        slotId,
      });
    } else if ((by === "instructor" || by === "admin") && studentId) {
      await sendToUsers([studentId], "Отмена вождения", `Занятие ${dk} ${st} отменено.`, {
        kind: "drive_cancelled",
        slotId,
      });
    }
  }
});

exports.onDriveSlotDeleted = onDocumentDeleted("driveSlots/{slotId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  const studentId = typeof data.studentId === "string" ? data.studentId.trim() : "";
  if (!studentId) return;
  const dk = typeof data.dateKey === "string" ? data.dateKey : "";
  const st = typeof data.startTime === "string" ? data.startTime : "";
  await sendToUsers([studentId], "Запись удалена", `Запись на вождение ${dk} ${st} удалена инструктором.`, {
    kind: "drive_deleted",
    slotId: event.params.slotId,
  });
});

exports.onFreeWindowCreated = onDocumentCreated("freeDriveWindows/{windowId}", async (event) => {
  const d = event.data.data();
  const status = typeof d.status === "string" ? d.status : "";
  if (status !== "open") return;
  const instructorId = typeof d.instructorId === "string" ? d.instructorId.trim() : "";
  if (!instructorId) return;

  const insSnap = await db.collection("users").doc(instructorId).get();
  if (!insSnap.exists) return;
  const attached = insSnap.data().attachedStudentIds;
  if (!Array.isArray(attached)) return;

  const students = attached.filter((id) => typeof id === "string" && id.trim());
  if (students.length === 0) return;

  const dk = typeof d.dateKey === "string" ? d.dateKey : "";
  const st = typeof d.startTime === "string" ? d.startTime : "";
  await sendToUsers(students, "Свободное окно", `Инструктор добавил окно для записи: ${dk} ${st}.`, {
    kind: "free_window",
    windowId: event.params.windowId,
  });
});

exports.onFreeWindowUpdated = onDocumentUpdated("freeDriveWindows/{windowId}", async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : {};
  const after = event.data.after.data();
  if (!after) return;

  const bStatus = typeof before.status === "string" ? before.status : "";
  const aStatus = typeof after.status === "string" ? after.status : "";
  if (bStatus !== "open" || aStatus !== "reserved") return;

  const sid = typeof after.studentId === "string" ? after.studentId.trim() : "";
  if (!sid) return;

  const instructorId = typeof after.instructorId === "string" ? after.instructorId.trim() : "";
  if (!instructorId) return;

  const dk = typeof after.dateKey === "string" ? after.dateKey : "";
  const st = typeof after.startTime === "string" ? after.startTime : "";

  await sendToUsers([instructorId], "Бронь окна", `Курсант забронировал свободное окно ${dk} ${st}.`, {
    kind: "window_reserved",
    windowId: event.params.windowId,
  });
});

exports.onTalonHistoryCreated = onDocumentCreated("adminTalonHistory/{entryId}", async (event) => {
  const d = event.data.data();
  const targetUid = typeof d.targetUid === "string" ? d.targetUid.trim() : "";
  if (!targetUid) return;

  const role = typeof d.targetRole === "string" ? d.targetRole : "";
  if (role !== "student" && role !== "instructor") return;

  const delta = typeof d.delta === "number" ? d.delta : 0;
  if (delta === 0) return;

  const prev = typeof d.previousTalons === "number" ? d.previousTalons : 0;
  const next = typeof d.newTalons === "number" ? d.newTalons : 0;

  if (delta > 0) {
    await sendToUsers([targetUid], "Талоны", `Зачисление на баланс: +${delta} (было ${prev}, стало ${next}).`, {
      kind: "talon_credit",
      entryId: event.params.entryId,
    });
  } else {
    await sendToUsers([targetUid], "Талоны", `Списание с баланса: ${delta} (было ${prev}, стало ${next}).`, {
      kind: "talon_debit",
      entryId: event.params.entryId,
    });
  }
});
