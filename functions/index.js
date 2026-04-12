/**
 * Push (FCM): входящие сообщения, запись/вождение, окна, талоны.
 * Деплой: cd functions && npm i && cd .. && firebase deploy --only functions
 */
const admin = require("firebase-admin");
const { setGlobalOptions } = require("firebase-functions/v2");
const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
} = require("firebase-functions/v2/firestore");

setGlobalOptions({ region: "europe-west1", maxInstances: 10 });

admin.initializeApp();
const db = admin.firestore();

function tsMillis(v) {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

async function tokensForUser(uid) {
  const u = (uid ?? "").trim();
  if (!u) return [];
  const snap = await db.collection("users").doc(u).collection("fcmTokens").get();
  return snap.docs.map((d) => d.data().token).filter((t) => typeof t === "string" && t.length > 40);
}

async function sendToUsers(uids, title, body, data = {}) {
  const uidSet = [...new Set((uids ?? []).map((x) => (x ?? "").trim()).filter(Boolean))];
  const tokens = [];
  for (const uid of uidSet) {
    tokens.push(...(await tokensForUser(uid)));
  }
  const uniq = [...new Set(tokens)];
  if (uniq.length === 0) return;

  const dataPayload = {};
  for (const [k, v] of Object.entries(data)) {
    dataPayload[k] = v == null ? "" : String(v);
  }

  await admin.messaging().sendEachForMulticast({
    tokens: uniq,
    notification: { title, body },
    data: dataPayload,
  });
}

function messagePreview(data) {
  const type = typeof data.type === "string" ? data.type : "text";
  const text = typeof data.text === "string" ? data.text.trim() : "";
  if (type === "text") return text.length > 120 ? `${text.slice(0, 117)}…` : text || "Сообщение";
  if (type === "voice") return "Голосовое сообщение";
  if (type === "image") return "Фото";
  if (type === "file") return "Файл";
  return "Сообщение";
}

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

    const body = messagePreview(msg);
    await sendToUsers(recipients, "Новое сообщение", body, {
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
