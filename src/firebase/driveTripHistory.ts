import { doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import type { Trip, TripError, TripPoint } from "@/types/tripHistory";
import { getFirebase } from "./config";

const COLLECTION = "driveTripTracks";

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return fallback;
}

/** Число или Firestore Timestamp / { seconds } — иначе NaN. */
function numberOrFirestoreTimeMs(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object") {
    const any = v as { toMillis?: () => number; seconds?: unknown; nanoseconds?: unknown };
    if (typeof any.toMillis === "function") {
      const t = any.toMillis();
      if (typeof t === "number" && Number.isFinite(t)) return t;
    }
    if (typeof any.seconds === "number" && Number.isFinite(any.seconds)) {
      const ns = typeof any.nanoseconds === "number" ? any.nanoseconds : 0;
      return any.seconds * 1000 + Math.floor(ns / 1e6);
    }
  }
  return NaN;
}

function pointFromRaw(p: unknown): TripPoint | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  const lat = num(o.lat, NaN);
  const lng = num(o.lng, NaN);
  const ts = numberOrFirestoreTimeMs(o.timestamp);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(ts)) return null;
  const pt: TripPoint = { lat, lng, timestamp: ts };
  if (o.speed != null) pt.speed = num(o.speed);
  if (o.accuracy != null) pt.accuracy = num(o.accuracy);
  if (o.heading != null) pt.heading = num(o.heading);
  if (o.altitude != null) pt.altitude = num(o.altitude);
  return pt;
}

function errFromRaw(e: unknown): TripError | null {
  if (!e || typeof e !== "object") return null;
  const o = e as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const type = o.type;
  const severity = o.severity;
  const desc = typeof o.description === "string" ? o.description : "";
  const pt = pointFromRaw(o.point);
  if (!id || !pt) return null;
  if (
    type !== "speeding" &&
    type !== "hard_brake" &&
    type !== "hard_acceleration" &&
    type !== "sharp_turn" &&
    type !== "lane_change"
  ) {
    return null;
  }
  if (severity !== "low" && severity !== "medium" && severity !== "high") return null;
  return { id, type, point: pt, severity, description: desc };
}

export function tripFromFirestore(data: Record<string, unknown>, id: string): Trip | null {
  const driveSlotId = typeof data.driveSlotId === "string" ? data.driveSlotId : id;
  const userId = typeof data.userId === "string" ? data.userId : "";
  const instructorId = typeof data.instructorId === "string" ? data.instructorId : "";
  if (!userId || !instructorId) return null;

  const pointsRaw = data.points;
  const points: TripPoint[] = [];
  if (Array.isArray(pointsRaw)) {
    for (const p of pointsRaw) {
      const pt = pointFromRaw(p);
      if (pt) points.push(pt);
    }
  }

  const errorsRaw = data.errors;
  const errors: TripError[] | undefined = Array.isArray(errorsRaw)
    ? errorsRaw.map(errFromRaw).filter((x): x is TripError => x != null)
    : undefined;

  const status = data.status;
  const syncStatus = data.syncStatus;

  return {
    id: typeof data.id === "string" ? data.id : id,
    userId,
    instructorId,
    carId: typeof data.carId === "string" ? data.carId : "",
    driveSlotId,
    startTime: (() => {
      const st = numberOrFirestoreTimeMs(data.startTime);
      return Number.isFinite(st) ? st : num(data.startTime, 0);
    })(),
    endTime:
      data.endTime == null
        ? null
        : (() => {
            const e = numberOrFirestoreTimeMs(data.endTime);
            return Number.isFinite(e) ? e : null;
          })(),
    duration: num(data.duration),
    distance: num(data.distance),
    avgSpeed: num(data.avgSpeed),
    maxSpeed: num(data.maxSpeed),
    points,
    status:
      status === "recording" ||
      status === "completed" ||
      status === "paused" ||
      status === "synced"
        ? status
        : "completed",
    syncStatus:
      syncStatus === "pending" ||
      syncStatus === "syncing" ||
      syncStatus === "synced" ||
      syncStatus === "error"
        ? syncStatus
        : "synced",
    notes: typeof data.notes === "string" ? data.notes : undefined,
    rating: typeof data.rating === "number" ? data.rating : undefined,
    errors: errors && errors.length > 0 ? errors : undefined,
  };
}

/**
 * Firestore не принимает значения `undefined` даже во вложенных объектах массива точек
 * (иначе «Invalid use of undefined as a Firestore argument» — трек не сохраняется).
 */
function tripPointForFirestore(p: TripPoint): Record<string, unknown> {
  const o: Record<string, unknown> = {
    lat: p.lat,
    lng: p.lng,
    timestamp: p.timestamp,
  };
  if (p.speed !== undefined) o.speed = p.speed;
  if (p.accuracy !== undefined) o.accuracy = p.accuracy;
  if (p.heading !== undefined) o.heading = p.heading;
  if (p.altitude !== undefined) o.altitude = p.altitude;
  return o;
}

function tripErrorForFirestore(e: TripError): Record<string, unknown> {
  return {
    id: e.id,
    type: e.type,
    severity: e.severity,
    description: e.description,
    point: tripPointForFirestore(e.point),
  };
}

function stripForFirestore(t: Trip): Record<string, unknown> {
  const o: Record<string, unknown> = {
    id: t.id,
    userId: t.userId,
    instructorId: t.instructorId,
    carId: t.carId,
    driveSlotId: t.driveSlotId,
    startTime: t.startTime,
    endTime: t.endTime,
    duration: t.duration,
    distance: t.distance,
    avgSpeed: t.avgSpeed,
    maxSpeed: t.maxSpeed,
    points: t.points.map(tripPointForFirestore),
    status: t.status,
    syncStatus: t.syncStatus,
  };
  if (t.notes !== undefined) o.notes = t.notes;
  if (t.rating !== undefined) o.rating = t.rating;
  if (t.errors !== undefined && t.errors.length > 0) {
    o.errors = t.errors.map(tripErrorForFirestore);
  }
  return o;
}

export function subscribeDriveTripForSlot(
  driveSlotId: string,
  onTrip: (trip: Trip | null) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  const { db } = getFirebase();
  const ref = doc(db, COLLECTION, driveSlotId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onTrip(null);
        return;
      }
      const t = tripFromFirestore(snap.data() as Record<string, unknown>, snap.id);
      onTrip(t);
    },
    (e) => onError?.(e)
  );
}

export async function saveDriveTripToServer(trip: Trip): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, COLLECTION, trip.driveSlotId);
  await setDoc(ref, stripForFirestore(trip), { merge: true });
}
