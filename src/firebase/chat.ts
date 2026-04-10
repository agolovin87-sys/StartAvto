import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  limit,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import type { QuerySnapshot } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { deleteObject, ref } from "firebase/storage";
import { getFirebase } from "./config";
import type {
  ChatMessage,
  ChatMessageType,
  ChatReactionMap,
  ChatRoom,
} from "@/types";

function toMillis(v: unknown): number {
  if (
    v &&
    typeof v === "object" &&
    "toMillis" in v &&
    typeof (v as { toMillis: () => number }).toMillis === "function"
  ) {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === "number") return v;
  return Date.now();
}

function getPairChatId(uidA: string, uidB: string): string {
  const [a, b] = [uidA.trim(), uidB.trim()].sort();
  return `pair_${a}_${b}`;
}

function messageTypePreview(type: ChatMessageType, text: string): string {
  if (type === "text") return text.trim();
  if (type === "voice") return "Голосовое сообщение";
  if (type === "image") return "Фото";
  if (type === "file") return "Файл";
  return "Сообщение";
}

/** Строка превью в списке чатов по последнему сообщению (если в комнате пустой lastMessageText). */
export function previewLineFromChatMessage(msg: ChatMessage): string {
  if (msg.deletedForAll) return "Сообщение удалено";
  if (msg.type === "text") {
    const t = (msg.text ?? "").trim();
    return t.length > 0 ? t : "Сообщение";
  }
  return messageTypePreview(msg.type, msg.text ?? "");
}

function normalizeChatRoomDoc(
  data: Record<string, unknown>,
  id: string
): ChatRoom {
  const participantIdsRaw = Array.isArray(data.participantIds)
    ? (data.participantIds as unknown[])
    : [];
  const participantIds = participantIdsRaw
    .filter((x) => typeof x === "string")
    .map((x) => x as string);

  const title = typeof data.title === "string" ? data.title : "";
  const kindRaw = data.kind;
  const kindStr =
    typeof kindRaw === "string" ? kindRaw.trim().toLowerCase() : "";
  const isGroup =
    kindStr === "group" ||
    id.startsWith("group_") ||
    (title.trim().length > 0 && !id.startsWith("pair_"));
  const kind: "pair" | "group" = isGroup ? "group" : "pair";
  const avatarDataUrl =
    typeof data.avatarDataUrl === "string" ? data.avatarDataUrl : null;
  const participantEmailsLower = Array.isArray(data.participantEmailsLower)
    ? (data.participantEmailsLower as unknown[])
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const membershipModeRaw = data.membershipMode;
  const membershipMode =
    membershipModeRaw === "linkedGroup" ? "linkedGroup" : "manual";

  return {
    id,
    participantIds,
    participantEmailsLower,
    kind,
    membershipMode,
    title,
    avatarDataUrl,
    createdAt: toMillis(data.createdAt),
    lastMessageAt:
      data.lastMessageAt === undefined || data.lastMessageAt === null
        ? null
        : toMillis(data.lastMessageAt),
    lastMessageText:
      typeof data.lastMessageText === "string" ? data.lastMessageText : "",
  };
}

function isLinkedMembershipMode(data: Record<string, unknown>): boolean {
  return data.membershipMode === "linkedGroup";
}

function looksLikeGroupChatDoc(chatId: string, data: Record<string, unknown>): boolean {
  const kind = typeof data.kind === "string" ? data.kind.trim().toLowerCase() : "";
  if (kind === "group") return true;
  if (chatId.startsWith("group_")) return true;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  return title.length > 0 && !chatId.startsWith("pair_");
}

function normalizeChatMessageDoc(
  data: Record<string, unknown>,
  id: string,
  chatId: string
): ChatMessage {
  const typeRawStr =
    typeof data.type === "string" ? data.type.trim().toLowerCase() : "";
  let type: ChatMessageType =
    typeRawStr === "text" || typeRawStr === "voice" || typeRawStr === "image"
      ? (typeRawStr as ChatMessageType)
      : typeRawStr === "file"
        ? "file"
        : "text";

  const reactionsRaw = data.reactions as unknown;
  const reactions: ChatReactionMap | undefined =
    reactionsRaw &&
    typeof reactionsRaw === "object" &&
    !Array.isArray(reactionsRaw)
      ? (reactionsRaw as ChatReactionMap)
      : undefined;

  const deletedForMeBy = Array.isArray(data.deletedForMeBy)
    ? (data.deletedForMeBy as unknown[]).filter((x) => typeof x === "string") as
        | string[]
        | []
    : [];

  const deletedForAll =
    typeof data.deletedForAll === "boolean" ? data.deletedForAll : false;

  const forwarded = data.forwarded === true;

  const payloadDataUrl =
    typeof data.payloadDataUrl === "string" ? data.payloadDataUrl : null;
  const mimeTypeStr = typeof data.mimeType === "string" ? data.mimeType : null;
  const fileNameStr = typeof data.fileName === "string" ? data.fileName : null;

  /** iOS/WebKit: иногда `type` не доходит в первом snapshot — по mime/fileName восстанавливаем голосовое. */
  if (
    type === "text" &&
    payloadDataUrl &&
    mimeTypeStr &&
    mimeTypeStr.toLowerCase().startsWith("audio/")
  ) {
    type = "voice";
  } else if (
    type === "text" &&
    payloadDataUrl &&
    fileNameStr &&
    fileNameStr.toLowerCase().startsWith("voice-")
  ) {
    type = "voice";
  }

  return {
    id,
    chatId,
    senderId: typeof data.senderId === "string" ? data.senderId : "",
    type,
    text: typeof data.text === "string" ? data.text : "",
    payloadDataUrl,
    fileName: fileNameStr,
    mimeType: mimeTypeStr,
    replyToMessageId:
      typeof data.replyToMessageId === "string" ? data.replyToMessageId : null,
    forwarded,
    createdAt: toMillis(data.createdAt),
    editedAt:
      data.editedAt === undefined || data.editedAt === null
        ? null
        : toMillis(data.editedAt),
    reactions,
    deletedForMeBy,
    deletedForAll,
  };
}

/** Создаёт/обновляет комнату и возвращает chatId (для пары). */
export async function ensurePairChatExists(
  participantA: string,
  participantB: string
): Promise<string> {
  const { db } = getFirebase();
  const a = participantA.trim();
  const b = participantB.trim();
  const chatId = getPairChatId(a, b);
  const [sortedA, sortedB] = [a, b].sort();
  const ref = doc(db, "chats", chatId);
  await setDoc(
    ref,
    {
      participantIds: [sortedA, sortedB],
      kind: "pair",
      createdAt: serverTimestamp(),
      lastMessageAt: null,
      lastMessageText: "",
    },
    { merge: true }
  );
  return chatId;
}

/**
 * Перед записью метаданных комнаты: для пары документ мог ещё не существовать
 * (чат открыт по вычисленному pair_* id без предварительного ensure).
 */
async function ensureChatDocExistsForSend(
  chatRef: ReturnType<typeof doc>,
  chatId: string,
  fromUserId: string,
  toUserId: string | undefined
): Promise<void> {
  if (chatId.startsWith("pair_")) {
    if (!toUserId?.trim()) {
      throw new Error("Не удалось создать чат: выберите контакт ещё раз.");
    }
    try {
      const snap = await getDoc(chatRef);
      if (snap.exists()) return;
    } catch {
      /* нет чтения / сеть — merge через ensurePairChatExists */
    }
    await ensurePairChatExists(fromUserId, toUserId);
    return;
  }
  const snap = await getDoc(chatRef);
  if (!snap.exists()) {
    throw new Error("Чат не найден. Возможно, группа была удалена.");
  }
}

function normalizeChatParticipantIds(ids: string[]): string[] {
  return [
    ...new Set(
      ids
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean)
    ),
  ];
}

function participantIdsFromFirestoreField(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const strs = (raw as unknown[]).filter(
    (x): x is string => typeof x === "string"
  );
  return normalizeChatParticipantIds(strs);
}

function manualGroupChatIdsFromField(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      (raw as unknown[])
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter((x) => x.startsWith("group_"))
    ),
  ];
}

/**
 * Нормализует ids участников по users/{docId}:
 * оставляет docId и добавляет data.uid (если отличается) — для старых профилей с рассинхроном uid.
 */
async function expandParticipantIdsWithUserUid(ids: string[]): Promise<string[]> {
  const base = normalizeChatParticipantIds(ids);
  if (base.length === 0) return base;
  const { db } = getFirebase();
  const extra = new Set<string>();
  await Promise.all(
    base.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, FIRESTORE_USERS, id));
        if (!snap.exists()) return;
        const rawUid = (snap.data() as Record<string, unknown>).uid;
        const canonical = typeof rawUid === "string" ? rawUid.trim() : "";
        if (canonical && canonical !== id) extra.add(canonical);
      } catch {
        /* ignore */
      }
    })
  );
  return normalizeChatParticipantIds([...base, ...extra]);
}

async function collectParticipantEmailsLower(userIds: string[]): Promise<string[]> {
  const ids = normalizeChatParticipantIds(userIds);
  if (ids.length === 0) return [];
  const { db } = getFirebase();
  const out = new Set<string>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, FIRESTORE_USERS, id));
        if (!snap.exists()) return;
        const rawEmail = (snap.data() as Record<string, unknown>).email;
        const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
        if (email) out.add(email);
      } catch {
        /* ignore */
      }
    })
  );
  return [...out];
}

async function syncManualGroupChatIdsInUserDocs(
  chatId: string,
  nextParticipantIds: string[],
  prevParticipantIds: string[]
): Promise<void> {
  const { db } = getFirebase();
  const next = new Set(normalizeChatParticipantIds(nextParticipantIds));
  const prev = new Set(normalizeChatParticipantIds(prevParticipantIds));
  const toAdd = [...next].filter((id) => !prev.has(id));
  const toRemove = [...prev].filter((id) => !next.has(id));
  if (toAdd.length === 0 && toRemove.length === 0) return;

  const batch = writeBatch(db);
  for (const uid of toAdd) {
    batch.update(doc(db, FIRESTORE_USERS, uid), {
      manualGroupChatIds: arrayUnion(chatId),
    });
  }
  for (const uid of toRemove) {
    batch.update(doc(db, FIRESTORE_USERS, uid), {
      manualGroupChatIds: arrayRemove(chatId),
    });
  }
  await batch.commit();
}

const FIRESTORE_GROUPS = "groups";
const FIRESTORE_USERS = "users";

function attachedStudentIdsFromProfileData(data: Record<string, unknown>): string[] {
  const raw = data.attachedStudentIds;
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Инструкторы, у которых в закреплении есть хотя бы один uid из списка курсантов учебной группы. */
async function instructorUidsWithAttachedInSet(studentUidSet: Set<string>): Promise<string[]> {
  if (studentUidSet.size === 0) return [];
  const { db } = getFirebase();
  const insSnap = await getDocs(
    query(collection(db, FIRESTORE_USERS), where("role", "==", "instructor"))
  );
  const out: string[] = [];
  for (const d of insSnap.docs) {
    const att = attachedStudentIdsFromProfileData(d.data() as Record<string, unknown>);
    if (att.some((sid) => studentUidSet.has(sid))) out.push(d.id);
  }
  return out;
}

/**
 * Поддерживает участие инструктора в чат-группах, привязанных к учебным группам через `linkedChatGroupId`:
 * в чате остаётся, если есть хотя бы один закреплённый курсант с соответствующим `users.groupId`.
 */
export async function syncInstructorLinkedChatsForInstructor(
  instructorUid: string
): Promise<void> {
  const iid = instructorUid.trim();
  if (!iid) return;

  const { db } = getFirebase();
  const insRef = doc(db, FIRESTORE_USERS, iid);
  const insSnap = await getDoc(insRef);
  if (!insSnap.exists()) return;
  const idata = insSnap.data() as Record<string, unknown>;
  if (idata.role !== "instructor") return;

  const attached = attachedStudentIdsFromProfileData(idata);
  const trainingGroupIds = new Set<string>();
  for (const sid of attached) {
    const stSnap = await getDoc(doc(db, FIRESTORE_USERS, sid.trim()));
    if (!stSnap.exists()) continue;
    const g = (stSnap.data() as Record<string, unknown>).groupId;
    const gid = typeof g === "string" ? g.trim() : "";
    if (gid) trainingGroupIds.add(gid);
  }

  const groupsSnap = await getDocs(collection(db, FIRESTORE_GROUPS));
  for (const gdoc of groupsSnap.docs) {
    const linkRaw = (gdoc.data() as Record<string, unknown>).linkedChatGroupId;
    const chatId =
      typeof linkRaw === "string" && linkRaw.trim().startsWith("group_")
        ? linkRaw.trim()
        : "";
    if (!chatId) continue;

    const shouldInclude = trainingGroupIds.has(gdoc.id);
    const chatRef = doc(db, "chats", chatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) continue;
    const chatData = chatSnap.data() as Record<string, unknown>;
    if (!isLinkedMembershipMode(chatData)) continue;

    const base = participantIdsFromFirestoreField(
      chatData.participantIds
    );
    const hasIns = base.includes(iid);

    if (shouldInclude && !hasIns) {
      const next = normalizeChatParticipantIds([...base, iid]);
      if (next.length < 2) continue;
      await updateDoc(chatRef, { participantIds: next, kind: "group" });
    } else if (!shouldInclude && hasIns) {
      const next = base.filter((x) => x !== iid);
      if (next.length === 0) continue;
      await updateDoc(chatRef, { participantIds: next, kind: "group" });
    }
  }
}

/** После смены учебной группы курсанта — обновить состав привязанных чатов у его инструкторов. */
export async function syncLinkedChatsForInstructorsOfStudent(studentUid: string): Promise<void> {
  const sid = studentUid.trim();
  if (!sid) return;
  const { db } = getFirebase();
  const snap = await getDocs(
    query(
      collection(db, FIRESTORE_USERS),
      where("attachedStudentIds", "array-contains", sid)
    )
  );
  for (const d of snap.docs) {
    const role = (d.data() as Record<string, unknown>).role;
    if (role === "instructor") {
      await syncInstructorLinkedChatsForInstructor(d.id);
    }
  }
}

/**
 * Когда у учебной группы в Firestore задано `linkedChatGroupId`, при записи курсанта
 * в `users.groupId` автоматически добавляем/убираем его uid в `participantIds` чат-группы.
 */
export async function syncStudentToLinkedChatGroup(
  trainingGroupId: string,
  studentUid: string,
  add: boolean
): Promise<void> {
  const tid = trainingGroupId.trim();
  const uid = studentUid.trim();
  if (!tid || !uid) return;

  const { db } = getFirebase();
  const tgSnap = await getDoc(doc(db, FIRESTORE_GROUPS, tid));
  if (!tgSnap.exists()) return;

  const linkRaw = (tgSnap.data() as Record<string, unknown>).linkedChatGroupId;
  const chatId =
    typeof linkRaw === "string" && linkRaw.trim().startsWith("group_")
      ? linkRaw.trim()
      : "";
  if (!chatId) return;

  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) return;

  const data = chatSnap.data() as Record<string, unknown>;
  if (!isLinkedMembershipMode(data)) return;
  const base = participantIdsFromFirestoreField(data.participantIds);
  const next = add
    ? normalizeChatParticipantIds([...base, uid])
    : base.filter((x) => x !== uid);

  if (next.length === 0) return;
  await updateDoc(chatRef, { participantIds: next, kind: "group" });
}

/**
 * Привязка учебной группы к чат-группе: сохраняет `linkedChatGroupId` и добавляет в чат
 * всех курсантов, у которых уже стоит этот `users.groupId`.
 */
export async function linkTrainingGroupToChatGroup(
  trainingGroupId: string,
  chatGroupId: string | null
): Promise<void> {
  const tid = trainingGroupId.trim();
  if (!tid) return;

  const { db } = getFirebase();
  const tgRef = doc(db, FIRESTORE_GROUPS, tid);

  if (!chatGroupId?.trim()) {
    await updateDoc(tgRef, { linkedChatGroupId: deleteField() });
    return;
  }

  const cid = chatGroupId.trim();
  if (!cid.startsWith("group_")) {
    throw new Error("Нужен групповой чат (id начинается с group_)");
  }

  const chatRef = doc(db, "chats", cid);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) throw new Error("Чат-группа не найдена");

  const cdata = chatSnap.data() as Record<string, unknown>;

  const membersSnap = await getDocs(
    query(collection(db, FIRESTORE_USERS), where("groupId", "==", tid))
  );
  const memberUids = membersSnap.docs.map((d) => d.id).filter(Boolean);
  const memberSet = new Set(memberUids);
  const instructorUids = await instructorUidsWithAttachedInSet(memberSet);

  const base = participantIdsFromFirestoreField(cdata.participantIds);
  const mergedBase = normalizeChatParticipantIds([
    ...base,
    ...memberUids,
    ...instructorUids,
  ]);
  const merged = await expandParticipantIdsWithUserUid(mergedBase);
  const participantEmailsLower = await collectParticipantEmailsLower(merged);
  if (merged.length < 2) {
    throw new Error(
      "В чате должно быть минимум два участника. Создайте чат-группу в разделе «Чат» и добавьте людей, затем привяжите снова."
    );
  }
  await updateDoc(chatRef, {
    participantIds: merged,
    participantEmailsLower,
    kind: "group",
    membershipMode: "linkedGroup",
  });
  await updateDoc(tgRef, { linkedChatGroupId: cid });
}

/**
 * Курсант/инструктор сами добавляют себя в participantIds привязанной чат-группы (правила Firestore:
 * studentSelfJoinLinkedGroupChat / instructorSelfJoinGroupChat). Нужно, если админская синхронизация
 * не сработала или чат привязали после назначения в группу.
 */
export async function ensureSelfInLinkedGroupChatsForProfile(profile: {
  uid: string;
  role: string;
  email?: string;
  groupId?: string;
  attachedStudentIds?: string[];
}): Promise<void> {
  const uid = profile.uid.trim();
  if (!uid) return;
  const { db } = getFirebase();

  const tryJoin = async (
    chatId: string,
    mode: "linkedGroup" | "manual" | "any" = "linkedGroup"
  ) => {
    const cid = chatId.trim();
    if (!cid.startsWith("group_")) return;
    const snap = await getDoc(doc(db, "chats", cid));
    if (!snap.exists()) return;
    const data = snap.data() as Record<string, unknown>;
    const membershipMode =
      data.membershipMode === "linkedGroup" ? "linkedGroup" : "manual";
    if (mode !== "any" && membershipMode !== mode) return;
    try {
      await updateDoc(doc(db, "chats", cid), {
        participantIds: arrayUnion(uid),
        kind: "group",
      });
    } catch {
      /* нет прав / уже ок / сеть */
    }
  };

  const authEmailLower = (getAuth(getFirebase().app).currentUser?.email ?? "")
    .trim()
    .toLowerCase();
  const emailLower = authEmailLower || (profile.email ?? "").trim().toLowerCase();
  if (emailLower) {
    try {
      const manualSnap = await getDocs(
        query(
          collection(db, "chats"),
          where("participantEmailsLower", "array-contains", emailLower)
        )
      );
      for (const d of manualSnap.docs) {
        const data = d.data() as Record<string, unknown>;
        const mode = data.membershipMode;
        const kind = data.kind;
        const isGroup = kind === "group" || d.id.startsWith("group_");
        if (!isGroup || mode !== "manual") continue;
        await tryJoin(d.id, "manual");
      }
    } catch {
      /* ignore manual email join issues */
    }
  }

  if (profile.role === "student") {
    const gid = (profile.groupId ?? "").trim();
    if (!gid) return;
    const gSnap = await getDoc(doc(db, FIRESTORE_GROUPS, gid));
    if (!gSnap.exists()) return;
    const linkRaw = (gSnap.data() as Record<string, unknown>).linkedChatGroupId;
    const chatId =
      typeof linkRaw === "string" && linkRaw.trim().startsWith("group_")
        ? linkRaw.trim()
        : "";
    if (!chatId) return;
    await tryJoin(chatId);
    return;
  }

  if (profile.role === "instructor") {
    const attached = [
      ...new Set(
        (profile.attachedStudentIds ?? [])
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean)
      ),
    ];
    if (attached.length === 0) return;
    const trainingGroupIds = new Set<string>();
    for (const sid of attached) {
      const stSnap = await getDoc(doc(db, FIRESTORE_USERS, sid));
      if (!stSnap.exists()) continue;
      const g = (stSnap.data() as Record<string, unknown>).groupId;
      const tg = typeof g === "string" ? g.trim() : "";
      if (tg) trainingGroupIds.add(tg);
    }
    for (const gid of trainingGroupIds) {
      const gSnap = await getDoc(doc(db, FIRESTORE_GROUPS, gid));
      if (!gSnap.exists()) continue;
      const linkRaw = (gSnap.data() as Record<string, unknown>).linkedChatGroupId;
      const chatId =
        typeof linkRaw === "string" && linkRaw.trim().startsWith("group_")
          ? linkRaw.trim()
          : "";
      if (!chatId) continue;
      await tryJoin(chatId);
    }
  }
}

/**
 * Бэкфилл participantEmailsLower для существующих ручных чат-групп.
 * Нужен для старых групп, созданных до введения email-метки участников.
 */
export async function backfillManualGroupParticipantEmails(): Promise<void> {
  const { db } = getFirebase();
  const chatsSnap = await getDocs(collection(db, "chats"));
  for (const d of chatsSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (!looksLikeGroupChatDoc(d.id, data)) continue;
    const mode = data.membershipMode === "linkedGroup" ? "linkedGroup" : "manual";
    if (mode !== "manual") continue;
    const participantIds = participantIdsFromFirestoreField(data.participantIds);
    if (participantIds.length === 0) continue;
    const emails = await collectParticipantEmailsLower(participantIds);
    const current = Array.isArray(data.participantEmailsLower)
      ? (data.participantEmailsLower as unknown[])
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean)
      : [];
    const next = [...new Set(emails)].sort();
    const prev = [...new Set(current)].sort();
    const needEmailsPatch = next.join(",") !== prev.join(",");
    const kindRaw = typeof data.kind === "string" ? data.kind.trim().toLowerCase() : "";
    const needKindPatch = kindRaw !== "group";
    const needMembershipSync = data.manualGroupMemberSyncVersion !== 1;
    if (needMembershipSync) {
      await syncManualGroupChatIdsInUserDocs(d.id, participantIds, []);
    }
    if (!needEmailsPatch && !needKindPatch && !needMembershipSync) continue;
    await updateDoc(doc(db, "chats", d.id), {
      ...(needEmailsPatch ? { participantEmailsLower: next } : {}),
      ...(needKindPatch ? { kind: "group" } : {}),
      ...(needMembershipSync ? { manualGroupMemberSyncVersion: 1 } : {}),
    });
  }
}

/** Групповой чат: id `group_*`, все участники в `participantIds`. */
export async function createGroupChat(input: {
  creatorId: string;
  title: string;
  avatarDataUrl: string | null;
  memberUserIds: string[];
  /** Явный список email отмеченных участников (lowercase), чтобы не зависеть от lookup users/{uid}. */
  memberEmailsLower?: string[];
}): Promise<string> {
  const { db } = getFirebase();
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `group_${crypto.randomUUID()}`
      : `group_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  const creator = input.creatorId.trim();
  const participantIds = await expandParticipantIdsWithUserUid([
    creator,
    ...input.memberUserIds,
  ]);
  const participantEmailsFromUsers = await collectParticipantEmailsLower(participantIds);
  const participantEmailsLower = [
    ...new Set([
      ...participantEmailsFromUsers,
      ...((input.memberEmailsLower ?? [])
        .map((x) => (typeof x === "string" ? x.trim().toLowerCase() : ""))
        .filter(Boolean)),
    ]),
  ];
  const title = input.title.trim().slice(0, 120);
  if (!title) throw new Error("Укажите название группы");
  await setDoc(doc(db, "chats", id), {
    participantIds,
    participantEmailsLower,
    kind: "group",
    membershipMode: "manual",
    title,
    avatarDataUrl: input.avatarDataUrl,
    createdBy: creator,
    createdAt: serverTimestamp(),
    lastMessageAt: null,
    lastMessageText: "",
  });
  await syncManualGroupChatIdsInUserDocs(id, participantIds, []);
  return id;
}

/** Обновление группы: название, аватар, состав участников (текущий пользователь должен входить в список). */
export async function updateGroupChat(input: {
  chatId: string;
  title: string;
  avatarDataUrl: string | null;
  participantIds: string[];
  participantEmailsLower?: string[];
}): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, "chats", input.chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Чат не найден");
  const data = snap.data() as Record<string, unknown>;
  const prevParticipantIds = participantIdsFromFirestoreField(data.participantIds);
  const kindStr =
    typeof data.kind === "string" ? data.kind.trim().toLowerCase() : "";
  const isGroupDoc =
    kindStr === "group" || input.chatId.startsWith("group_");
  if (!isGroupDoc) throw new Error("Не групповой чат");

  const title = input.title.trim().slice(0, 120);
  if (!title) throw new Error("Укажите название группы");

  const participantIds = await expandParticipantIdsWithUserUid(
    input.participantIds
  );
  const participantEmailsFromUsers = await collectParticipantEmailsLower(participantIds);
  const participantEmailsLower = [
    ...new Set([
      ...participantEmailsFromUsers,
      ...((input.participantEmailsLower ?? [])
        .map((x) => (typeof x === "string" ? x.trim().toLowerCase() : ""))
        .filter(Boolean)),
    ]),
  ];
  if (participantIds.length < 2) {
    throw new Error("Добавьте хотя бы одного участника");
  }

  await updateDoc(ref, {
    kind: "group",
    membershipMode: "manual",
    title,
    avatarDataUrl: input.avatarDataUrl,
    participantIds,
    participantEmailsLower,
  });
  await syncManualGroupChatIdsInUserDocs(
    input.chatId,
    participantIds,
    prevParticipantIds
  );
}

/** Удаляет документ группы и все сообщения в подколлекции. */
export async function deleteGroupChat(chatId: string): Promise<void> {
  const { db } = getFirebase();
  const chatRef = doc(db, "chats", chatId);
  const snap = await getDoc(chatRef);
  if (!snap.exists()) return;
  const data = snap.data() as Record<string, unknown>;
  const kindStr =
    typeof data.kind === "string" ? data.kind.trim().toLowerCase() : "";
  const isGroupDoc = kindStr === "group" || chatId.startsWith("group_");
  if (!isGroupDoc) throw new Error("Не групповой чат");
  const prevParticipantIds = participantIdsFromFirestoreField(data.participantIds);

  const messagesRef = collection(db, "chats", chatId, "messages");
  const messagesSnap = await getDocs(messagesRef);
  const docs = messagesSnap.docs;
  const BATCH = 500;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + BATCH)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
  await syncManualGroupChatIdsInUserDocs(chatId, [], prevParticipantIds);
  await deleteDoc(chatRef);
}

export function subscribeManualGroupChatsForUser(
  userId: string,
  onUpdate: (rooms: ChatRoom[]) => void,
  onError?: (e: Error) => void
): () => void {
  const uid = userId.trim();
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const { db } = getFirebase();
  const userRef = doc(db, FIRESTORE_USERS, uid);

  const roomsById = new Map<string, ChatRoom>();
  const chatUnsubs = new Map<string, () => void>();

  const emit = () => {
    onUpdate(
      [...roomsById.values()].sort(
        (a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0)
      )
    );
  };

  const unsubUser = onSnapshot(
    userRef,
    (snap) => {
      const data = (snap.data() as Record<string, unknown>) ?? {};
      const ids = new Set(manualGroupChatIdsFromField(data.manualGroupChatIds));

      for (const [cid, unsub] of chatUnsubs) {
        if (ids.has(cid)) continue;
        unsub();
        chatUnsubs.delete(cid);
        roomsById.delete(cid);
      }

      for (const cid of ids) {
        if (chatUnsubs.has(cid)) continue;
        const unsubChat = onSnapshot(
          doc(db, "chats", cid),
          (chatSnap) => {
            if (!chatSnap.exists()) {
              roomsById.delete(cid);
              emit();
              return;
            }
            const room = normalizeChatRoomDoc(
              chatSnap.data() as Record<string, unknown>,
              cid
            );
            if (room.kind !== "group") {
              roomsById.delete(cid);
              emit();
              return;
            }
            roomsById.set(cid, room);
            emit();
          },
          (e) => {
            roomsById.delete(cid);
            emit();
            onError?.(e);
          }
        );
        chatUnsubs.set(cid, unsubChat);
      }
      emit();
    },
    (e) => onError?.(e)
  );

  return () => {
    unsubUser();
    for (const unsub of chatUnsubs.values()) unsub();
    chatUnsubs.clear();
    roomsById.clear();
  };
}

/**
 * Пара 1:1 с `myUid`, второй участник не входит в `excludePeerIds` (например id курсантов).
 * Берётся комната с наибольшим lastMessageAt — для превью контакта «Администратор», если uid
 * в UI не совпал с uid в participantIds чата с другим админским аккаунтом.
 */
export function findLatestPairRoomWherePeerNotInSet(
  roomsList: ChatRoom[],
  myUid: string,
  excludePeerIds: Set<string>
): ChatRoom | null {
  const me = myUid.trim();
  if (!me) return null;
  let best: ChatRoom | null = null;
  let bestAt = -1;
  for (const r of roomsList) {
    if (r.kind === "group") continue;
    const ids = [
      ...new Set(
        r.participantIds
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean)
      ),
    ];
    if (ids.length !== 2 || !ids.includes(me)) continue;
    const other = ids.find((x) => x !== me);
    if (other == null || excludePeerIds.has(other)) continue;
    const t = r.lastMessageAt ?? 0;
    if (t >= bestAt) {
      bestAt = t;
      best = r;
    }
  }
  return best;
}

function roomsFromSnapshot(snap: QuerySnapshot): ChatRoom[] {
  return snap.docs.map((d) =>
    normalizeChatRoomDoc(d.data() as Record<string, unknown>, d.id)
  );
}

/**
 * Список чатов пользователя. Три слушателя и объединение по id:
 * - общий array-contains — пары без поля kind и всё сразу;
 * - array-contains + kind==group / kind==pair — если из‑за «битого» чужого документа общий запрос даёт permission-denied,
 *   группы (и пары с полем kind) всё равно подтягиваются (нужен составной индекс participantIds + kind).
 */
export function subscribeChatRoomsForUser(
  userId: string,
  onUpdate: (rooms: ChatRoom[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { app, db } = getFirebase();
  /** Правила сравнивают с request.auth.uid — в array-contains должен быть именно он; при гонке с React — fallback на переданный id. */
  const uid = (getAuth(app).currentUser?.uid ?? userId ?? "").trim();
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const passed = userId.trim();
  if (passed && passed !== uid && import.meta.env.DEV) {
    console.warn(
      "[subscribeChatRoomsForUser] переданный userId не совпадает с auth.uid, используем auth:",
      { passed, authUid: uid }
    );
  }

  const col = collection(db, "chats");
  type Buckets = { all: ChatRoom[]; group: ChatRoom[]; pair: ChatRoom[] };
  const bucketsByUid = new Map<string, Buckets>();
  const unsubs: Array<() => void> = [];
  let closed = false;

  const ensureBuckets = (key: string): Buckets => {
    const ex = bucketsByUid.get(key);
    if (ex) return ex;
    const created: Buckets = { all: [], group: [], pair: [] };
    bucketsByUid.set(key, created);
    return created;
  };

  const merge = () => {
    const byId = new Map<string, ChatRoom>();
    for (const b of bucketsByUid.values()) {
      for (const r of b.all) byId.set(r.id, r);
      for (const r of b.group) byId.set(r.id, r);
      for (const r of b.pair) byId.set(r.id, r);
    }
    onUpdate(
      [...byId.values()].sort(
        (a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0)
      )
    );
  };

  const subscribeForUid = (queryUid: string) => {
    const qid = queryUid.trim();
    if (!qid || closed || bucketsByUid.has(qid)) return;
    const buckets = ensureBuckets(qid);

    const qAll = query(col, where("participantIds", "array-contains", qid));
    const qGroup = query(
      col,
      where("participantIds", "array-contains", qid),
      where("kind", "==", "group")
    );
    const qPair = query(
      col,
      where("participantIds", "array-contains", qid),
      where("kind", "==", "pair")
    );

    unsubs.push(
      onSnapshot(
        qAll,
        (snap) => {
          buckets.all = roomsFromSnapshot(snap);
          merge();
        },
        (e) => {
          buckets.all = [];
          merge();
          onError?.(e);
        }
      )
    );
    unsubs.push(
      onSnapshot(
        qGroup,
        (snap) => {
          buckets.group = roomsFromSnapshot(snap);
          merge();
        },
        (e) => {
          buckets.group = [];
          merge();
          if (import.meta.env.DEV) {
            console.warn("[subscribeChatRoomsForUser] kind=group:", e.message);
          }
        }
      )
    );
    unsubs.push(
      onSnapshot(
        qPair,
        (snap) => {
          buckets.pair = roomsFromSnapshot(snap);
          merge();
        },
        (e) => {
          buckets.pair = [];
          merge();
          if (import.meta.env.DEV) {
            console.warn("[subscribeChatRoomsForUser] kind=pair:", e.message);
          }
        }
      )
    );
  };

  // Всегда слушаем текущий auth uid.
  subscribeForUid(uid);

  // И дополнительно слушаем legacy uid из users/{authUid}.uid (если он отличается).
  void (async () => {
    try {
      const meSnap = await getDoc(doc(db, FIRESTORE_USERS, uid));
      if (!meSnap.exists() || closed) return;
      const rawLegacy = (meSnap.data() as Record<string, unknown>).uid;
      const legacyUid = typeof rawLegacy === "string" ? rawLegacy.trim() : "";
      if (!legacyUid || legacyUid === uid) return;
      subscribeForUid(legacyUid);
    } catch {
      /* ignore legacy lookup errors */
    }
  })();

  // И ещё слушаем ручные группы по email (для случаев, когда uid в participantIds исторически не совпадает).
  void (async () => {
    try {
      if (closed) return;
      const authEmailLower = (getAuth(app).currentUser?.email ?? "")
        .trim()
        .toLowerCase();
      if (!authEmailLower) return;
      const qEmail = query(
        col,
        where("participantEmailsLower", "array-contains", authEmailLower)
      );
      const bucketKey = `email:${authEmailLower}`;
      if (!bucketsByUid.has(bucketKey)) {
        const buckets = ensureBuckets(bucketKey);
        unsubs.push(
          onSnapshot(
            qEmail,
            (snap) => {
              buckets.all = roomsFromSnapshot(snap);
              buckets.group = [];
              buckets.pair = [];
              merge();
            },
            (e) => {
              buckets.all = [];
              merge();
              if (import.meta.env.DEV) {
                console.warn("[subscribeChatRoomsForUser] by email:", e.message);
              }
            }
          )
        );
      }
    } catch {
      /* ignore email listener errors */
    }
  })();

  return () => {
    closed = true;
    unsubs.forEach((u) => u());
  };
}

export function subscribeMessagesForChat(
  chatId: string,
  onUpdate: (messages: ChatMessage[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  const ref = collection(db, "chats", chatId, "messages");
  const q = query(ref, orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) =>
        normalizeChatMessageDoc(d.data() as Record<string, unknown>, d.id, chatId)
      );
      onUpdate(list);
    },
    (e) => onError?.(e)
  );
}

/** Последнее сообщение чата (для фоновых уведомлений без открытой вкладки «Чат»). */
export function subscribeLatestMessageForChat(
  chatId: string,
  onUpdate: (message: ChatMessage | null) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  const ref = collection(db, "chats", chatId, "messages");
  const q = query(ref, orderBy("createdAt", "desc"), limit(1));
  return onSnapshot(
    q,
    (snap) => {
      const d = snap.docs[0];
      if (!d) {
        onUpdate(null);
        return;
      }
      onUpdate(
        normalizeChatMessageDoc(
          d.data() as Record<string, unknown>,
          d.id,
          chatId
        )
      );
    },
    (e) => onError?.(e as Error)
  );
}

export async function sendChatTextMessage(input: {
  fromUserId: string;
  /** Для новой пары; для существующего чата можно не передавать, если есть `chatId` */
  toUserId?: string;
  chatId?: string;
  text: string;
  replyToMessageId?: string | null;
  /** Пересланное сообщение — показывается метка в чате */
  forwarded?: boolean;
}): Promise<string> {
  const { db } = getFirebase();
  const chatId =
    input.chatId ??
    (await ensurePairChatExists(input.fromUserId, input.toUserId ?? ""));
  if (!input.chatId && !input.toUserId) {
    throw new Error("toUserId или chatId обязателен");
  }

  const msgText = input.text.trim();
  const preview = messageTypePreview("text", msgText);

  const chatRef = doc(db, "chats", chatId);
  await ensureChatDocExistsForSend(chatRef, chatId, input.fromUserId, input.toUserId);

  const messageRef = doc(collection(db, "chats", chatId, "messages"));
  const payload = {
    chatId,
    senderId: input.fromUserId,
    type: "text" as const,
    text: msgText,
    replyToMessageId: input.replyToMessageId ?? null,
    forwarded: input.forwarded === true,
    payloadDataUrl: null,
    fileName: null,
    mimeType: null,
    createdAt: serverTimestamp(),
    editedAt: null,
    reactions: {},
    deletedForMeBy: [],
    deletedForAll: false,
  };
  const batch = writeBatch(db);
  batch.set(messageRef, payload);
  batch.update(chatRef, {
    lastMessageAt: serverTimestamp(),
    lastMessageText: preview,
  });
  await batch.commit();

  return messageRef.id;
}

export async function sendChatAttachmentMessage(input: {
  fromUserId: string;
  toUserId?: string;
  chatId?: string;
  messageType: Exclude<ChatMessageType, "text">; // voice/image/file
  payloadDataUrl: string;
  fileName?: string | null;
  mimeType?: string | null;
  replyToMessageId?: string | null;
  forwarded?: boolean;
}): Promise<string> {
  const { db } = getFirebase();
  const chatId =
    input.chatId ??
    (await ensurePairChatExists(input.fromUserId, input.toUserId ?? ""));
  if (!input.chatId && !input.toUserId) {
    throw new Error("toUserId или chatId обязателен");
  }

  const preview = messageTypePreview(input.messageType, "");
  const chatRef = doc(db, "chats", chatId);

  await ensureChatDocExistsForSend(chatRef, chatId, input.fromUserId, input.toUserId);

  const messageRef = doc(collection(db, "chats", chatId, "messages"));
  const payload = {
    chatId,
    senderId: input.fromUserId,
    type: input.messageType,
    text: "",
    replyToMessageId: input.replyToMessageId ?? null,
    forwarded: input.forwarded === true,
    payloadDataUrl: input.payloadDataUrl,
    fileName: input.fileName ?? null,
    mimeType: input.mimeType ?? null,
    createdAt: serverTimestamp(),
    editedAt: null,
    reactions: {},
    deletedForMeBy: [],
    deletedForAll: false,
  };
  const batch = writeBatch(db);
  batch.set(messageRef, payload);
  batch.update(chatRef, {
    lastMessageAt: serverTimestamp(),
    lastMessageText: preview,
  });
  await batch.commit();

  return messageRef.id;
}

/**
 * Одна реакция на пользователя на сообщение: новый эмодзи заменяет старый.
 * Если пользователь уже поставил этот же эмодзи — реакция снимается (как повторный выбор в меню).
 */
export async function toggleReaction(input: {
  chatId: string;
  messageId: string;
  userId: string;
  emoji: string;
}): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, "chats", input.chatId, "messages", input.messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as Record<string, unknown>;
  const reactions = (data.reactions as ChatReactionMap | undefined) ?? {};

  let currentEmoji: string | null = null;
  for (const [k, v] of Object.entries(reactions)) {
    if (Array.isArray(v) && v.includes(input.userId)) {
      currentEmoji = k;
      break;
    }
  }

  const sameAsCurrent = currentEmoji === input.emoji;

  const next: ChatReactionMap = { ...reactions };
  for (const k of Object.keys(next)) {
    const arr = [...(next[k] ?? [])].filter((id) => id !== input.userId);
    if (arr.length === 0) delete next[k];
    else next[k] = arr;
  }

  if (!sameAsCurrent) {
    const list = next[input.emoji] ?? [];
    if (!list.includes(input.userId)) {
      next[input.emoji] = [...list, input.userId];
    }
  }

  await updateDoc(ref, { reactions: next });
}

/** Снять реакцию текущего пользователя с сообщения (все вхождения userId в карте). */
export async function clearUserReactionOnMessage(input: {
  chatId: string;
  messageId: string;
  userId: string;
}): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, "chats", input.chatId, "messages", input.messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as Record<string, unknown>;
  const reactions = (data.reactions as ChatReactionMap | undefined) ?? {};
  const next: ChatReactionMap = { ...reactions };
  for (const k of Object.keys(next)) {
    const arr = [...(next[k] ?? [])].filter((id) => id !== input.userId);
    if (arr.length === 0) delete next[k];
    else next[k] = arr;
  }
  await updateDoc(ref, { reactions: next });
}

export async function editChatTextMessage(input: {
  chatId: string;
  messageId: string;
  userId: string;
  nextText: string;
}): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, "chats", input.chatId, "messages", input.messageId);
  await updateDoc(ref, {
    text: input.nextText.trim(),
    editedAt: serverTimestamp(),
  });
}

export async function deleteChatMessageForMe(input: {
  chatId: string;
  messageId: string;
  userId: string;
}): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, "chats", input.chatId, "messages", input.messageId);
  await updateDoc(ref, {
    deletedForMeBy: arrayUnion(input.userId),
    deletedForAll: false,
  });
}

/** Пересылает копии сообщений выбранным пользователям (порядок сообщений сохраняется). */
export async function forwardChatMessagesToRecipients(input: {
  fromUserId: string;
  messages: ChatMessage[];
  recipientUserIds: string[];
}): Promise<void> {
  const { fromUserId, messages, recipientUserIds } = input;
  const uniq = [...new Set(recipientUserIds.filter((id) => id && id !== fromUserId))];
  for (const toUserId of uniq) {
    const chatId = await ensurePairChatExists(fromUserId, toUserId);
    for (const msg of messages) {
      if (msg.deletedForAll) continue;
      if (msg.type === "text") {
        const t = (msg.text ?? "").trim();
        if (!t) continue;
        await sendChatTextMessage({
          fromUserId,
          toUserId,
          chatId,
          text: t,
          replyToMessageId: null,
          forwarded: true,
        });
      } else {
        const payload = msg.payloadDataUrl;
        if (!payload) continue;
        await sendChatAttachmentMessage({
          fromUserId,
          toUserId,
          chatId,
          messageType: msg.type as Exclude<ChatMessageType, "text">,
          payloadDataUrl: payload,
          fileName: msg.fileName ?? null,
          mimeType: msg.mimeType ?? null,
          replyToMessageId: null,
          forwarded: true,
        });
      }
    }
  }
}

function isFirebaseStorageDownloadUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" && u.hostname.includes("firebasestorage.googleapis.com");
  } catch {
    return false;
  }
}

/** Удаляет объект в Storage по полной download URL (если вложение когда‑либо хранилось в Storage). */
async function tryDeleteStorageObjectFromPayloadUrl(url: string): Promise<void> {
  const t = url.trim();
  if (!t.startsWith("http")) return;
  if (!isFirebaseStorageDownloadUrl(t)) return;
  try {
    const { storage } = getFirebase();
    const fileRef = ref(storage, t);
    await deleteObject(fileRef);
  } catch {
    /* уже удалён, нет прав или не Storage URL */
  }
}

export async function deleteChatMessageForAll(input: {
  chatId: string;
  messageId: string;
}): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, "chats", input.chatId, "messages", input.messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as Record<string, unknown>;
  const type = typeof data.type === "string" ? data.type : "";
  const payloadRaw = data.payloadDataUrl;
  const payload =
    typeof payloadRaw === "string" && payloadRaw.length > 0 ? payloadRaw : null;

  if (payload?.startsWith("http")) {
    await tryDeleteStorageObjectFromPayloadUrl(payload);
  }

  const stripAttachment =
    type === "image" ||
    type === "file" ||
    type === "voice" ||
    Boolean(payload);

  if (stripAttachment) {
    await updateDoc(ref, {
      deletedForAll: true,
      payloadDataUrl: null,
      fileName: null,
      mimeType: null,
    });
  } else {
    await updateDoc(ref, { deletedForAll: true });
  }
}

/** Считаем «печатает», если updatedAt не старше этого окна (мс). */
const CHAT_TYPING_TTL_MS = 8000;

export function subscribeChatTypingPeers(
  chatId: string,
  myUserId: string,
  onUpdate: (peerUserIds: string[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  const col = collection(db, "chats", chatId, "typing");
  return onSnapshot(
    col,
    (snap) => {
      const now = Date.now();
      const out: string[] = [];
      for (const d of snap.docs) {
        if (d.id === myUserId) continue;
        const at = (d.data() as { updatedAt?: unknown }).updatedAt;
        const t = typeof at === "number" && Number.isFinite(at) ? at : 0;
        if (now - t < CHAT_TYPING_TTL_MS) out.push(d.id);
      }
      onUpdate(out);
    },
    (e) => onError?.(e)
  );
}

export async function pulseChatTypingIndicator(
  chatId: string,
  userId: string
): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  const { db } = getFirebase();
  await setDoc(
    doc(db, "chats", chatId, "typing", uid),
    { updatedAt: Date.now() },
    { merge: true }
  );
}

export async function clearChatTypingIndicator(
  chatId: string,
  userId: string
): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  const { db } = getFirebase();
  try {
    await deleteDoc(doc(db, "chats", chatId, "typing", uid));
  } catch {
    /* уже удалён / нет прав */
  }
}

/**
 * Uid собеседников, с которыми у пользователя есть документ pair_* в /chats (для админского просмотра переписки).
 */
export async function fetchPeerUidsWithExistingPairChatsForUser(userId: string): Promise<string[]> {
  const uid = userId.trim();
  if (!uid) return [];
  const { db } = getFirebase();
  const q = query(
    collection(db, "chats"),
    where("participantIds", "array-contains", uid)
  );
  const snap = await getDocs(q);
  const peers = new Set<string>();
  for (const d of snap.docs) {
    if (!d.id.startsWith("pair_")) continue;
    const data = d.data() as Record<string, unknown>;
    const raw = data.participantIds;
    if (!Array.isArray(raw)) continue;
    for (const x of raw) {
      if (typeof x !== "string") continue;
      const t = x.trim();
      if (t && t !== uid) peers.add(t);
    }
  }
  return [...peers];
}

// Экспортируем только публичную часть.
export const chatIdPair = getPairChatId;

