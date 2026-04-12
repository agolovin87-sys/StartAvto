import { useEffect, useRef } from "react";
import { isFirebaseConfigured } from "@/firebase/config";
import { writeInstructorLiveLocation } from "@/firebase/instructorLiveLocation";

const MIN_WRITE_INTERVAL_MS = 35_000;

/**
 * Пока инструктор в кабинете, периодически пишет координаты в Firestore (для вкладки GPS у админа).
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
  const lastWriteRef = useRef(0);

  useEffect(() => {
    if (!isFirebaseConfigured || !uidTrim || !active) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const tryWrite = (lat: number, lng: number) => {
      const now = Date.now();
      if (now - lastWriteRef.current < MIN_WRITE_INTERVAL_MS) return;
      lastWriteRef.current = now;
      void writeInstructorLiveLocation(uidTrim, lat, lng).catch(() => {});
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        tryWrite(pos.coords.latitude, pos.coords.longitude);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 25_000 }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [uidTrim, active]);

  return null;
}
