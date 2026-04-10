import type { DriveSlot, FreeDriveWindow } from "@/types";
import { normalizeTalonsValue } from "@/firebase/users";

/** Активные записи на вождение: ожидают подтверждения или запланированы. */
export function countStudentActiveDriveSlots(slots: DriveSlot[], studentId: string): number {
  return slots.filter(
    (s) =>
      s.studentId === studentId &&
      (s.status === "pending_confirmation" || s.status === "scheduled")
  ).length;
}

/**
 * Сколько «слотов» у курсанта уже занято: вождения в driveSlots + бронь свободного окна
 * (пока инструктор не подтвердил и не создал scheduled-слот).
 */
export function countStudentCommittedBookings(
  slots: DriveSlot[],
  studentId: string,
  freeWindows: FreeDriveWindow[]
): number {
  const driveCount = countStudentActiveDriveSlots(slots, studentId);
  const reservedWindows = freeWindows.filter(
    (w) => w.studentId === studentId && w.status === "reserved"
  ).length;
  return driveCount + reservedWindows;
}

export type TalonBookingBlockReason = "zero" | "insufficient";

/** Можно ли оформить ещё одно вождение: талонов должно быть больше, чем уже занято слотов. */
export function evaluateStudentTalonBooking(
  talonsRaw: unknown,
  committedBookingsCount: number
): { ok: true } | { ok: false; reason: TalonBookingBlockReason } {
  const talons = normalizeTalonsValue(talonsRaw);
  if (talons <= 0) return { ok: false, reason: "zero" };
  if (talons <= committedBookingsCount) return { ok: false, reason: "insufficient" };
  return { ok: true };
}

export const INSTRUCTOR_TALON_MSG_ZERO = "Запись не возможна, у курсанта 0 талонов!";

export const INSTRUCTOR_TALON_MSG_INSUFFICIENT =
  "Количество талонов у курсанта не соответствует количеству вождений! На балансе недостаточно талонов!";

export const STUDENT_TALON_MSG_ZERO = "Бронь не возможна, на Вашем балансе 0 талонов";

export const STUDENT_TALON_MSG_INSUFFICIENT = "На Вашем балансе недостаточно талонов!";
