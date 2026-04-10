import {
  collection,
  documentId,
  getDocs,
  query,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type UpdateData,
} from "firebase/firestore";
import { deleteObject, ref as storageRef } from "firebase/storage";
import { getFirebase } from "./config";

/** Порог для шкалы «план» в настройках (оценка объёма данных чатов в Firestore). */
export const FIREBASE_CHAT_PLAN_BYTES = 5 * 1024 * 1024 * 1024;

export type ChatMemoryPurgeCategory = "image_file" | "voice" | "text";

export type PerUserChatMemory = {
  uid: string;
  imageFileBytes: number;
  voiceBytes: number;
  textBytes: number;
};

export type ChatFirestoreMemorySnapshot = {
  totalBytes: number;
  imageFileBytes: number;
  voiceBytes: number;
  textBytes: number;
  byUser: PerUserChatMemory[];
  chatCount: number;
  messageCount: number;
};

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function messageContribution(data: Record<string, unknown>): {
  uid: string | null;
  imageFile: number;
  voice: number;
  text: number;
} {
  const uid = typeof data.senderId === "string" ? data.senderId.trim() : null;
  const type = typeof data.type === "string" ? data.type : "text";
  const payload = typeof data.payloadDataUrl === "string" ? data.payloadDataUrl : "";
  const text = typeof data.text === "string" ? data.text : "";

  let imageFile = 0;
  let voice = 0;
  let textB = 0;
  if (type === "image" || type === "file") {
    if (payload.length > 0) imageFile += utf8ByteLength(payload);
  } else if (type === "voice") {
    if (payload.length > 0) voice += utf8ByteLength(payload);
  } else {
    if (text.length > 0) textB += utf8ByteLength(text);
  }
  return { uid, imageFile, voice, text: textB };
}

/**
 * Оценка объёма данных в сообщениях чатов (поля text и payloadDataUrl в Firestore).
 * Не включает метаданные документов и индексы — только полезная нагрузка в строках.
 */
export async function fetchChatFirestoreMemorySnapshot(): Promise<ChatFirestoreMemorySnapshot> {
  const { db } = getFirebase();
  const chatsSnap = await getDocs(collection(db, "chats"));
  const byUid = new Map<string, { imageFile: number; voice: number; text: number }>();
  let imageFileBytes = 0;
  let voiceBytes = 0;
  let textBytes = 0;
  let messageCount = 0;

  for (const chatDoc of chatsSnap.docs) {
    const chatId = chatDoc.id;
    const msgSnap = await getDocs(collection(db, "chats", chatId, "messages"));
    for (const d of msgSnap.docs) {
      messageCount += 1;
      const data = d.data() as Record<string, unknown>;
      const c = messageContribution(data);
      imageFileBytes += c.imageFile;
      voiceBytes += c.voice;
      textBytes += c.text;
      if (!c.uid) continue;
      const cur = byUid.get(c.uid) ?? { imageFile: 0, voice: 0, text: 0 };
      cur.imageFile += c.imageFile;
      cur.voice += c.voice;
      cur.text += c.text;
      byUid.set(c.uid, cur);
    }
  }

  const byUser: PerUserChatMemory[] = [...byUid.entries()]
    .map(([uid, v]) => ({
      uid,
      imageFileBytes: v.imageFile,
      voiceBytes: v.voice,
      textBytes: v.text,
    }))
    .filter((u) => u.imageFileBytes + u.voiceBytes + u.textBytes > 0)
    .sort(
      (a, b) =>
        b.imageFileBytes +
        b.voiceBytes +
        b.textBytes -
        (a.imageFileBytes + a.voiceBytes + a.textBytes)
    );

  return {
    totalBytes: imageFileBytes + voiceBytes + textBytes,
    imageFileBytes,
    voiceBytes,
    textBytes,
    byUser,
    chatCount: chatsSnap.size,
    messageCount,
  };
}

const USER_ID_IN_CHUNK = 25;

export async function fetchUserDisplayNamesForAdmin(
  uids: string[]
): Promise<Map<string, string>> {
  const { db } = getFirebase();
  const map = new Map<string, string>();
  const uniq = [...new Set(uids.map((u) => u.trim()).filter(Boolean))];
  for (let i = 0; i < uniq.length; i += USER_ID_IN_CHUNK) {
    const slice = uniq.slice(i, i + USER_ID_IN_CHUNK);
    const q = query(collection(db, "users"), where(documentId(), "in", slice));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const name =
        typeof data.displayName === "string" && data.displayName.trim()
          ? data.displayName.trim()
          : d.id;
      map.set(d.id, name);
    }
  }
  for (const id of uniq) {
    if (!map.has(id)) map.set(id, id);
  }
  return map;
}

function isFirebaseStorageDownloadUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" && u.hostname.includes("firebasestorage.googleapis.com");
  } catch {
    return false;
  }
}

async function tryDeleteStorageObjectFromPayloadUrl(url: string): Promise<void> {
  const t = url.trim();
  if (!t.startsWith("http")) return;
  if (!isFirebaseStorageDownloadUrl(t)) return;
  try {
    const { storage } = getFirebase();
    await deleteObject(storageRef(storage, t));
  } catch {
    /* уже удалён или нет прав */
  }
}

function matchesPurge(
  data: Record<string, unknown>,
  senderUid: string,
  category: ChatMemoryPurgeCategory
): boolean {
  const sid = typeof data.senderId === "string" ? data.senderId.trim() : "";
  if (sid !== senderUid) return false;
  const type = typeof data.type === "string" ? data.type : "text";
  const text = typeof data.text === "string" ? data.text : "";

  if (category === "image_file") {
    return type === "image" || type === "file";
  }
  if (category === "voice") {
    return type === "voice";
  }
  return type === "text" && text.trim().length > 0;
}

/**
 * Удаляет у сообщений отправителя вложения или текст в Firestore (как «удалить у всех» по смыслу для пользователей).
 */
export async function adminPurgeUserChatDataInFirestore(
  senderId: string,
  category: ChatMemoryPurgeCategory
): Promise<number> {
  const uid = senderId.trim();
  if (!uid) return 0;
  const { db } = getFirebase();
  const chatsSnap = await getDocs(collection(db, "chats"));
  let updated = 0;
  let batch = writeBatch(db);
  let ops = 0;

  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };

  const enqueue = async (ref: DocumentReference, payload: UpdateData<DocumentData>) => {
    batch.update(ref, payload);
    ops += 1;
    updated += 1;
    if (ops >= 500) await flush();
  };

  for (const chatDoc of chatsSnap.docs) {
    const chatId = chatDoc.id;
    const msgSnap = await getDocs(collection(db, "chats", chatId, "messages"));
    for (const d of msgSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (!matchesPurge(data, uid, category)) continue;

      const payload =
        typeof data.payloadDataUrl === "string" && data.payloadDataUrl.length > 0
          ? data.payloadDataUrl
          : null;

      if (payload?.startsWith("http")) {
        await tryDeleteStorageObjectFromPayloadUrl(payload);
      }

      if (category === "text") {
        await enqueue(d.ref, { deletedForAll: true, text: "" });
      } else {
        await enqueue(d.ref, {
          deletedForAll: true,
          payloadDataUrl: null,
          fileName: null,
          mimeType: null,
        });
      }
    }
  }

  await flush();
  return updated;
}

export function formatStorageBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 Б";
  if (n < 1024) return `${Math.round(n)} Б`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} КБ`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} МБ`;
  return `${(n / 1024 ** 3).toFixed(2)} ГБ`;
}
