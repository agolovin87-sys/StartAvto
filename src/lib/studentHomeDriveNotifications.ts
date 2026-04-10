import type { DriveSlot, FreeDriveWindow } from "@/types";

const STORAGE_KEY = "startavto.student.homeDriveSeen.v1";

/** Ключи: `free:${windowId}`, `slot:${slotId}` */
export function relevantDriveNotificationKeys(
  slots: DriveSlot[],
  freeWindows: FreeDriveWindow[],
  studentUid: string
): string[] {
  const uid = studentUid.trim();
  if (!uid) return [];

  const keys: string[] = [];

  for (const w of freeWindows) {
    if (w.status === "open") keys.push(`free:${w.id}`);
  }

  for (const s of slots) {
    if (s.studentId !== uid) continue;
    if (s.status === "pending_confirmation" || s.status === "scheduled") {
      keys.push(`slot:${s.id}`);
    }
  }

  return keys;
}

export function loadSeenDriveKeys(studentUid: string): Set<string> {
  const uid = studentUid.trim();
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

export function saveSeenDriveKeys(studentUid: string, keys: Set<string>): void {
  const uid = studentUid.trim();
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
