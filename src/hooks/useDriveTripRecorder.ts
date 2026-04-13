import { useCallback, useEffect, useRef, useState } from "react";
import type { DriveSlot } from "@/types";
import type { Trip, TripPoint } from "@/types/tripHistory";
import { saveDriveTripToServer } from "@/firebase/driveTripHistory";
import { localTripDelete, localTripGet, localTripPut } from "@/lib/tripHistoryLocalDb";
import { detectTripErrors, speedsFromPoints, sumDistanceM } from "@/lib/tripHistoryMetrics";

const MAX_POINTS = 12_000;
const MIN_INTERVAL_MS = 3_000;
const MIN_MOVE_M = 8;

function haversineQuickM(a: TripPoint, b: TripPoint): number {
  const R = 6_371_000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const lat1 = toR(a.lat);
  const lat2 = toR(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function useDriveTripRecorder(slot: DriveSlot, enabled: boolean) {
  const [pointsCount, setPointsCount] = useState(0);
  const [geoState, setGeoState] = useState<"unknown" | "ok" | "denied" | "unsupported">("unknown");
  const [lastSyncStatus, setLastSyncStatus] = useState<Trip["syncStatus"] | "idle">("idle");

  const pointsRef = useRef<TripPoint[]>([]);
  const lastAddedAtRef = useRef(0);
  const lastPointRef = useRef<TripPoint | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const finalizeLockRef = useRef(false);
  const slotRef = useRef(slot);
  slotRef.current = slot;

  const flushLocal = useCallback(async (partial: Trip) => {
    await localTripPut(partial);
  }, []);

  const finalizeAndUpload = useCallback(async (): Promise<void> => {
    if (finalizeLockRef.current) return;
    finalizeLockRef.current = true;
    try {
    if (watchIdRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    const sl = slotRef.current;
    const pts = [...pointsRef.current];
    const startMs = startedAtRef.current ?? Date.now();
    const endMs = Date.now();

    if (pts.length === 0) {
      await localTripDelete(sl.id);
      return;
    }

    const distance = sumDistanceM(pts);
    const { avgKmh, maxKmh } = speedsFromPoints(pts);
    const durationSec = Math.max(0, Math.round((endMs - startMs) / 1000));
    const errors = detectTripErrors(pts);

    const trip: Trip = {
      id: sl.id,
      driveSlotId: sl.id,
      userId: sl.studentId,
      instructorId: sl.instructorId,
      carId: "",
      startTime: startMs,
      endTime: endMs,
      duration: durationSec,
      distance,
      avgSpeed: avgKmh,
      maxSpeed: maxKmh,
      points: pts,
      status: "completed",
      syncStatus: "syncing",
      errors: errors.length > 0 ? errors : undefined,
    };

    await localTripPut(trip);
    setLastSyncStatus("syncing");

    try {
      await saveDriveTripToServer({ ...trip, syncStatus: "synced", status: "synced" });
      setLastSyncStatus("synced");
      await localTripDelete(sl.id);
    } catch {
      setLastSyncStatus("error");
      await localTripPut({ ...trip, syncStatus: "error", status: "completed" });
    }

    pointsRef.current = [];
    setPointsCount(0);
    startedAtRef.current = null;
    lastPointRef.current = null;
    } finally {
      finalizeLockRef.current = false;
    }
  }, []);

  const trySyncFromLocal = useCallback(async () => {
    const sl = slotRef.current;
    const t = await localTripGet(sl.id);
    if (!t || t.syncStatus === "synced") return;
    if (t.points.length === 0) {
      await localTripDelete(sl.id);
      return;
    }
    try {
      await saveDriveTripToServer({ ...t, syncStatus: "synced", status: "synced" });
      await localTripDelete(sl.id);
      setLastSyncStatus("synced");
    } catch {
      setLastSyncStatus("error");
    }
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoState("unsupported");
      return;
    }

    if (!enabled) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    let cancelled = false;

    void (async () => {
      const sl = slotRef.current;
      const existing = await localTripGet(sl.id);
      if (cancelled) return;

      if (existing?.points?.length && existing.syncStatus === "pending") {
        pointsRef.current = [...existing.points];
        lastPointRef.current = existing.points[existing.points.length - 1] ?? null;
        lastAddedAtRef.current = Date.now();
        setPointsCount(existing.points.length);
        startedAtRef.current = existing.startTime || sl.liveStudentAckAt || Date.now();
      } else {
        pointsRef.current = [];
        lastPointRef.current = null;
        lastAddedAtRef.current = 0;
        setPointsCount(0);
        startedAtRef.current = sl.liveStudentAckAt ?? Date.now();
      }

      const onPos: PositionCallback = (pos) => {
        if (cancelled) return;
        const sl2 = slotRef.current;
        const ts = pos.timestamp ? Number(pos.timestamp) : Date.now();
        const pt: TripPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: ts,
          speed:
            pos.coords.speed != null && Number.isFinite(pos.coords.speed)
              ? Math.max(0, pos.coords.speed * 3.6)
              : undefined,
          accuracy: pos.coords.accuracy != null ? pos.coords.accuracy : undefined,
          heading: pos.coords.heading != null ? pos.coords.heading : undefined,
          altitude: pos.coords.altitude != null ? pos.coords.altitude : undefined,
        };

        const now = Date.now();
        const prev = lastPointRef.current;
        if (prev && now - lastAddedAtRef.current < MIN_INTERVAL_MS) {
          const moved = haversineQuickM(prev, pt);
          if (moved < MIN_MOVE_M) return;
        }

        lastPointRef.current = pt;
        lastAddedAtRef.current = now;

        const arr = pointsRef.current;
        if (arr.length >= MAX_POINTS) arr.shift();
        arr.push(pt);
        setPointsCount(arr.length);
        setGeoState("ok");

        const startMs = startedAtRef.current ?? ts;
        const draft: Trip = {
          id: sl2.id,
          driveSlotId: sl2.id,
          userId: sl2.studentId,
          instructorId: sl2.instructorId,
          carId: "",
          startTime: startMs,
          endTime: null,
          duration: 0,
          distance: sumDistanceM(arr),
          avgSpeed: speedsFromPoints(arr).avgKmh,
          maxSpeed: speedsFromPoints(arr).maxKmh,
          points: arr,
          status: "recording",
          syncStatus: "pending",
        };
        void flushLocal(draft);
      };

      const onErr: PositionErrorCallback = (err) => {
        if (err.code === err.PERMISSION_DENIED) setGeoState("denied");
      };

      if (cancelled) return;
      watchIdRef.current = navigator.geolocation.watchPosition(onPos, onErr, {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 20_000,
      });
    })();

    return () => {
      cancelled = true;
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, slot.id, slot.liveStudentAckAt, flushLocal]);

  useEffect(() => {
    const onOnline = () => void trySyncFromLocal();
    window.addEventListener("online", onOnline);
    if (typeof navigator !== "undefined" && navigator.onLine) {
      void trySyncFromLocal();
    }
    return () => window.removeEventListener("online", onOnline);
  }, [trySyncFromLocal]);

  return {
    pointsCount,
    geoState,
    lastSyncStatus,
    finalizeAndUpload,
    trySyncFromLocal,
  };
}
