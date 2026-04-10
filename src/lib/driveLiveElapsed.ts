import type { DriveSlot } from "@/types";

/**
 * Прошедшее время вождения с учётом пауз (мс).
 * Отсчёт ведётся с момента подтверждения курсантом (`liveStudentAckAt`), не с «Начать» инструктора.
 */
export function driveLiveEffectiveElapsedMs(slot: DriveSlot, nowMs: number): number {
  const ack = slot.liveStudentAckAt;
  if (ack == null) return 0;
  const totalPaused = slot.liveTotalPausedMs ?? 0;
  const pausedAt = slot.livePausedAt;
  if (pausedAt != null && pausedAt >= ack) {
    return Math.max(0, pausedAt - ack - totalPaused);
  }
  return Math.max(0, nowMs - ack - totalPaused);
}
