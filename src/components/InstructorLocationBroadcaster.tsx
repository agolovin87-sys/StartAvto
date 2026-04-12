import { useEffect, useRef } from "react";
import { isFirebaseConfigured } from "@/firebase/config";
import { writeInstructorLiveLocation } from "@/firebase/instructorLiveLocation";

/** Максимально точный режим GPS (без кэша прошлых точек). */
const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 120_000,
};

function accuracyM(pos: GeolocationPosition): number {
  const a = pos.coords.accuracy;
  return typeof a === "number" && Number.isFinite(a) && a > 0 ? a : 9999;
}

/**
 * Пока инструктор в кабинете, пишет координаты в Firestore.
 * Запрашивается режим высокой точности (GPS); реальная погрешность зависит от устройства и среды (1 м без RTK недостижима).
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

  useEffect(() => {
    if (!isFirebaseConfigured || !uidTrim || !active) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const tryWrite = (pos: GeolocationPosition) => {
      const acc = accuracyM(pos);
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const now = Date.now();
      const elapsed = now - lastWriteAtRef.current;
      const prevAcc = lastWrittenAccRef.current;

      /** Чаще обновляем при хорошей точности; реже при грубой. */
      const urgent = acc <= 8 && elapsed >= 4000;
      const good = acc <= 18 && elapsed >= 10_000;
      const improved = acc < prevAcc - 4 && elapsed >= 5000;
      const periodic = elapsed >= 28_000;
      const first = lastWriteAtRef.current === 0;

      if (!first && !urgent && !good && !improved && !periodic) return;

      lastWriteAtRef.current = now;
      lastWrittenAccRef.current = acc;
      void writeInstructorLiveLocation(uidTrim, lat, lng, acc).catch(() => {});
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
    };
  }, [uidTrim, active]);

  return null;
}
