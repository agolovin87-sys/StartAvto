/** Галочки исходящих: одна синяя = доставлено, две зелёные = прочитано всеми собеседниками (в группе — всеми остальными). */

export type OutgoingReceipt = "sent" | "read";

export function pairOutgoingReceipt(
  messageCreatedAt: number,
  peerUid: string,
  lastReadByUser: Record<string, number> | undefined
): OutgoingReceipt {
  const peer = peerUid.trim();
  if (!peer) return "sent";
  const r = lastReadByUser?.[peer] ?? 0;
  return r >= messageCreatedAt ? "read" : "sent";
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
