import type { DriveSlot, FreeDriveWindow } from "@/types";

const STORAGE_KEY = "startavto.instructor.homeDriveSeen.v1";

/**
 * Ключи: `win:${freeWindowId}` — курсант забронировал окно (ожидает действий инструктора);
 * `ack:${slotId}` — курсант подтвердил старт вождения (таймер идёт).
 */
export function relevantInstructorHomeNotificationKeys(
  slots: DriveSlot[],
  freeWindows: FreeDriveWindow[],
  instructorUid: string
): string[] {
  const uid = instructorUid.trim();
  if (!uid) return [];

  const keys: string[] = [];

  for (const w of freeWindows) {
    if (w.instructorId !== uid) continue;
    if (w.status === "reserved" && (w.studentId?.trim() ?? "") !== "") {
      keys.push(`win:${w.id}`);
    }
  }

  for (const s of slots) {
    if (s.instructorId !== uid) continue;
    if (
      s.status === "scheduled" &&
      s.liveStartedAt != null &&
      s.liveStudentAckAt != null &&
      s.liveEndedAt == null
    ) {
      keys.push(`ack:${s.id}`);
    }
  }

  return keys;
}

export function loadInstructorSeenDriveKeys(instructorUid: string): Set<string> {
  const uid = instructorUid.trim();
  if (!uid) return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const all = JSON.parse(raw) as Record<string, unknown>;
    const arr = all[uid];
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function saveInstructorSeenDriveKeys(
  instructorUid: string,
  keys: Set<string>
): void {
  const uid = instructorUid.trim();
  if (!uid) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    const all: Record<string, string[]> =
      parsed && typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, string[]>)
        : {};
    all[uid] = [...keys];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* private mode / quota */
  }
}
