import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";

export const STUDENT_DRIVE_LOCATION_SHARES = "studentDriveLocationShares";

export const MAX_DRIVE_SHARE_ADDRESS_LEN = 500;
export const MAX_DRIVE_SHARE_COMMENT_LEN = 300;

export type StudentDriveLocationShare = {
  studentId: string;
  instructorId: string;
  lat: number;
  lng: number;
  accuracy: number;
  updatedAtMs: number | null;
  /** Человекочитаемый адрес (обратное геокодирование или координаты). */
  addressLabel: string;
  /** Уточнение места от курсанта. */
  locationComment: string;
};

function toMillis(v: unknown): number | null {
  if (
    v &&
    typeof v === "object" &&
    "toMillis" in v &&
    typeof (v as { toMillis: () => number }).toMillis === "function"
  ) {
    return (v as { toMillis: () => number }).toMillis();
  }
  return null;
}

export function normalizeStudentDriveLocationShare(
  data: Record<string, unknown> | undefined
): StudentDriveLocationShare | null {
  if (!data) return null;
  const lat = data.lat;
  const lng = data.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const sid = typeof data.studentId === "string" ? data.studentId : "";
  const iid = typeof data.instructorId === "string" ? data.instructorId : "";
  const acc = data.accuracy;
  const accuracy =
    typeof acc === "number" && Number.isFinite(acc) && acc > 0 ? acc : 50;
  const addressLabel =
    typeof data.addressLabel === "string" ? data.addressLabel.trim() : "";
  const locationComment =
    typeof data.locationComment === "string" ? data.locationComment.trim() : "";
  return {
    studentId: sid,
    instructorId: iid,
    lat,
    lng,
    accuracy,
    updatedAtMs: toMillis(data.updatedAt),
    addressLabel,
    locationComment,
  };
}

/** Строка для карточки: «Адрес: … (комментарий или —)». */
export function formatDriveShareAddressLine(share: StudentDriveLocationShare): string | null {
  const addr = share.addressLabel?.trim() ?? "";
  if (!addr) return null;
  const com = share.locationComment?.trim() ?? "";
  return `Адрес: ${addr} (${com || "-"})`;
}

/**
 * Убирает из строки Яндекса страну и субъект РФ, оставляя ориентир «город, улица, дом».
 */
export function shortenDriveShareAddressLabelForAdmin(full: string): string {
  const t = full.trim();
  if (!t) return "";
  const parts = t.split(/,\s*/).map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length === 0) return t;
  const out: string[] = [];
  for (const p of parts) {
    if (out.length === 0 && /^россия$/i.test(p)) continue;
    if (/область|республика|край\b|автономн|округ\b|федеральный/i.test(p)) {
      continue;
    }
    out.push(p);
  }
  return out.length > 0 ? out.join(", ") : t;
}

/**
 * Ячейка админской таблицы «График»: город/улица/дом (без страны и региона) и комментарий курсанта.
 */
export function formatDriveShareAdminScheduleCell(
  share: StudentDriveLocationShare | null
): string {
  if (!share) return "—";
  const raw = share.addressLabel?.trim() ?? "";
  const comment = share.locationComment?.trim() ?? "";
  const isCoordFallback = /^координаты\s/i.test(raw);
  const hasTextAddress = raw.length > 0 && !isCoordFallback;
  const shortAddr = hasTextAddress ? shortenDriveShareAddressLabelForAdmin(raw) : "";
  if (!shortAddr.trim() && !comment) return "—";
  if (!shortAddr.trim()) return `— · ${comment}`;
  if (!comment) return shortAddr;
  return `${shortAddr} · ${comment}`;
}

export async function writeStudentDriveLocationShare(
  slotId: string,
  params: {
    studentId: string;
    instructorId: string;
    lat: number;
    lng: number;
    accuracyM: number;
    addressLabel: string;
    locationComment: string;
  }
): Promise<void> {
  const id = slotId.trim();
  if (!id || !isFirebaseConfigured) return;
  const { db } = getFirebase();
  const acc = Number.isFinite(params.accuracyM) && params.accuracyM > 0 ? params.accuracyM : 50;
  const addr = params.addressLabel.trim().slice(0, MAX_DRIVE_SHARE_ADDRESS_LEN);
  const comment = params.locationComment.trim().slice(0, MAX_DRIVE_SHARE_COMMENT_LEN);
  await setDoc(
    doc(db, STUDENT_DRIVE_LOCATION_SHARES, id),
    {
      studentId: params.studentId.trim(),
      instructorId: params.instructorId.trim(),
      lat: params.lat,
      lng: params.lng,
      accuracy: Math.min(50_000, Math.max(1, acc)),
      addressLabel: addr,
      locationComment: comment,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Последняя отправка геолокации курсантом (по любому слоту), для админской вкладки GPS.
 */
export function subscribeLatestStudentDriveLocationShareForStudent(
  studentId: string,
  onUpdate: (share: StudentDriveLocationShare | null) => void,
  onError?: (e: Error) => void
): () => void {
  const sid = studentId.trim();
  if (!sid || !isFirebaseConfigured) {
    onUpdate(null);
    return () => {};
  }
  const { db } = getFirebase();
  const q = query(
    collection(db, STUDENT_DRIVE_LOCATION_SHARES),
    where("studentId", "==", sid),
    orderBy("updatedAt", "desc"),
    limit(1)
  );
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        onUpdate(null);
        return;
      }
      const d = snap.docs[0];
      onUpdate(
        normalizeStudentDriveLocationShare(d.data() as Record<string, unknown>)
      );
    },
    (e) => onError?.(e as Error)
  );
}

export function subscribeStudentDriveLocationShare(
  slotId: string,
  onUpdate: (share: StudentDriveLocationShare | null) => void,
  onError?: (e: Error) => void
): () => void {
  const id = slotId.trim();
  if (!id || !isFirebaseConfigured) {
    onUpdate(null);
    return () => {};
  }
  const { db } = getFirebase();
  return onSnapshot(
    doc(db, STUDENT_DRIVE_LOCATION_SHARES, id),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      onUpdate(
        normalizeStudentDriveLocationShare(snap.data() as Record<string, unknown>)
      );
    },
    (e) => onError?.(e as Error)
  );
}
