import { useEffect, useRef } from "react";
import { isFirebaseConfigured } from "@/firebase/config";
import { writeInstructorLiveLocation } from "@/firebase/instructorLiveLocation";

/** Высокая точность, без кэша прошлых чтений браузера. */
const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 120_000,
};

/** Ниже — лучше (типичный GPS под небом). */
const ACC_GOOD_M = 40;
const ACC_OK_M = 95;
const ACC_COARSE_M = 180;

/** Первая запись: подождать GPS, не слать сразу точку сотен/тысяч метров. */
const FIRST_WAIT_GOOD_MS = 12_000;
const FIRST_WAIT_OK_MS = 28_000;
const FIRST_FORCE_BEST_MS = 65_000;

/** Не подменять уже хорошую точку грубым чтением из сети (пока не устарело). */
const DOWNGRADE_GRACE_MS = 120_000;

function accuracyM(pos: GeolocationPosition): number {
  const a = pos.coords.accuracy;
  return typeof a === "number" && Number.isFinite(a) && a > 0 ? a : 9999;
}

type Sample = { lat: number; lng: number; acc: number };

/**
 * Пока инструктор в кабинете, пишет координаты в Firestore.
 * Сначала накапливает лучшее чтение по погрешности; не затирает точный GPS грубой сетью.
 */
export function InstructorLocationBroadcaster({
  uid,
  active,
}: {
  uid: string;
  active: boolean;
}): null {
  const uidTrim = uid.trim();
  const watchIdRef = useRef<number | null>(null);
  const lastWriteAtRef = useRef(0);
  const lastWrittenAccRef = useRef<number>(999_999);
  const sessionStartRef = useRef(0);
  const bestRef = useRef<Sample | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !uidTrim || !active) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    sessionStartRef.current = Date.now();
    bestRef.current = null;
    lastWriteAtRef.current = 0;
    lastWrittenAccRef.current = 999_999;

    const updateBest = (lat: number, lng: number, acc: number) => {
      const b = bestRef.current;
      if (!b || acc < b.acc) bestRef.current = { lat, lng, acc };
    };

    const tryWrite = (pos: GeolocationPosition) => {
      const acc = accuracyM(pos);
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const now = Date.now();
      const sessionAge = now - sessionStartRef.current;

      updateBest(lat, lng, acc);

      const lastAt = lastWriteAtRef.current;
      const lastAcc = lastWrittenAccRef.current;
      const elapsed = now - lastAt;

      if (lastAt > 0 && lastAcc <= ACC_GOOD_M && acc > Math.max(ACC_COARSE_M, lastAcc * 3)) {
        if (elapsed < DOWNGRADE_GRACE_MS) return;
      }

      const isFirst = lastAt === 0;
      let wLat = lat;
      let wLng = lng;
      let wAcc = acc;
      let shouldWrite = false;

      if (isFirst) {
        if (acc <= ACC_GOOD_M) shouldWrite = true;
        else if (acc <= ACC_OK_M && sessionAge >= FIRST_WAIT_GOOD_MS) shouldWrite = true;
        else if (acc <= ACC_COARSE_M && sessionAge >= FIRST_WAIT_OK_MS) shouldWrite = true;
        else if (sessionAge >= FIRST_FORCE_BEST_MS && bestRef.current) {
          shouldWrite = true;
          wLat = bestRef.current.lat;
          wLng = bestRef.current.lng;
          wAcc = bestRef.current.acc;
        }
      } else {
        if (acc < lastAcc - 3) shouldWrite = true;
        else if (acc <= 30 && elapsed >= 6000) shouldWrite = true;
        else if (acc <= ACC_GOOD_M && elapsed >= 10_000) shouldWrite = true;
        else if (acc <= ACC_OK_M && elapsed >= 22_000) shouldWrite = true;
        else if (acc <= ACC_COARSE_M && elapsed >= 45_000) shouldWrite = true;
        else if (elapsed >= 120_000 && acc <= Math.max(lastAcc * 1.4, 200)) shouldWrite = true;
        else if (elapsed >= 240_000) {
          const b = bestRef.current;
          if (b && b.acc < acc) {
            shouldWrite = true;
            wLat = b.lat;
            wLng = b.lng;
            wAcc = b.acc;
          } else if (acc <= Math.max(lastAcc, 120) * 1.25) shouldWrite = true;
        }
      }

      if (!shouldWrite) return;

      lastWriteAtRef.current = now;
      lastWrittenAccRef.current = wAcc;
      void writeInstructorLiveLocation(uidTrim, wLat, wLng, wAcc).catch(() => {});
    };

    void new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          tryWrite(pos);
          resolve();
        },
        () => resolve(),
        GEO_OPTIONS
      );
    });

    watchIdRef.current = navigator.geolocation.watchPosition(
      tryWrite,
      () => {},
      GEO_OPTIONS
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      lastWriteAtRef.current = 0;
      lastWrittenAccRef.current = 999_999;
      sessionStartRef.current = 0;
      bestRef.current = null;
    };
  }, [uidTrim, active]);

  return null;
}
