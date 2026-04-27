/** Галочки исходящих: одна синяя = доставлено, две зелёные = прочитано всеми собеседниками (в группе — всеми остальными). */

export type OutgoingReceipt = "sent" | "read";

/**
 * Личный чат: курсор читателя в Firestore может быть записан под Firebase Auth uid,
 * а в participantIds / контактах фигурировать другой id профиля — ищем максимум среди
 * всех ключей lastReadAtByUser, кроме известных «своих» uid.
 */
export function pairOutgoingReceipt(
  messageCreatedAt: number,
  lastReadByUser: Record<string, number> | undefined,
  selfKnownUids: readonly string[]
): OutgoingReceipt {
  const self = new Set(
    selfKnownUids
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean)
  );
  let peerRead = 0;
  for (const [uid, ms] of Object.entries(lastReadByUser ?? {})) {
    const k = typeof uid === "string" ? uid.trim() : "";
    if (!k || self.has(k)) continue;
    if (typeof ms === "number" && Number.isFinite(ms) && ms > peerRead) peerRead = ms;
  }
  return peerRead >= messageCreatedAt ? "read" : "sent";
}

export function groupOutgoingReceipt(
  messageCreatedAt: number,
  selfId: string,
  participantIds: string[],
  lastReadByUser: Record<string, number> | undefined
): OutgoingReceipt {
  const me = selfId.trim();
  const others = participantIds.map((x) => x.trim()).filter((x) => x && x !== me);
  if (others.length === 0) return "sent";
  const allRead = others.every((pid) => (lastReadByUser?.[pid] ?? 0) >= messageCreatedAt);
  return allRead ? "read" : "sent";
}

export function outgoingReceiptTitle(
  state: OutgoingReceipt,
  edited: boolean
): string {
  const base = state === "read" ? "Прочитано" : "Доставлено";
  return edited ? `${base} · изменено` : base;
}
