import { useEffect, useRef } from "react";
import { isFirebaseConfigured } from "@/firebase/config";
import {
  subscribeStudentLiveLocationRefreshRequests,
  writeStudentLiveLocation,
} from "@/firebase/studentLiveLocation";

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

/** Яндекс Локатор (IP): не чаще одного вызова за интервал. */
const LOCATOR_MIN_INTERVAL_MS = 62_000;
const LOCATOR_INTERVAL_MS = 78_000;
const LOCATOR_FIRST_DELAY_MS = 28_000;
/** Если GPS уже ≤ этого радиуса (м), Локатор не дергаем. */
const LOCATOR_SKIP_IF_GPS_ACCURACY_M = 90;

/**
 * После хорошей записи не принимать за короткое время скачок на сотни метров
 * только из‑за «чуть лучше» accuracy (типичный глюк Android: сеть после GPS).
 */
const TELEPORT_WINDOW_MS = 180_000;
const TELEPORT_MAX_M = 380;
const LOCK_GOOD_ACCURACY_M = 38;

function accuracyM(pos: GeolocationPosition): number {
  const a = pos.coords.accuracy;
  return typeof a === "number" && Number.isFinite(a) && a > 0 ? a : 9999;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

type Sample = { lat: number; lng: number; acc: number };

/**
 * Пока курсант в кабинете, пишет координаты в Firestore (вкладка GPS у админа).
 * Сначала накапливает лучшее чтение по погрешности; не затирает точный GPS грубой сетью.
 */
export function StudentLocationBroadcaster({
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
  const lastWrittenLatRef = useRef<number | null>(null);
  const lastWrittenLngRef = useRef<number | null>(null);
  const sessionStartRef = useRef(0);
  const bestRef = useRef<Sample | null>(null);
  const lastLocatorAtRef = useRef(0);

  useEffect(() => {
    if (!isFirebaseConfigured || !uidTrim || !active) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    sessionStartRef.current = Date.now();
    bestRef.current = null;
    lastWriteAtRef.current = 0;
    lastWrittenAccRef.current = 999_999;
    lastWrittenLatRef.current = null;
    lastWrittenLngRef.current = null;
    lastLocatorAtRef.current = 0;

    const updateBest = (lat: number, lng: number, acc: number) => {
      const b = bestRef.current;
      if (!b) {
        bestRef.current = { lat, lng, acc };
        return;
      }
      const sessionAge = Date.now() - sessionStartRef.current;
      const d = distanceMeters(lat, lng, b.lat, b.lng);
      if (sessionAge < TELEPORT_WINDOW_MS && d > 650 && b.acc < ACC_COARSE_M && acc < b.acc) {
        return;
      }
      if (acc < b.acc) bestRef.current = { lat, lng, acc };
    };

    /** Скачок далеко при уже хорошей точке — почти всегда смена источника (GPS→сеть), не перезаписываем. */
    const isSpuriousTeleport = (
      lat: number,
      lng: number,
      acc: number,
      lastAcc: number,
      elapsed: number
    ): boolean => {
      const pLat = lastWrittenLatRef.current;
      const pLng = lastWrittenLngRef.current;
      if (pLat == null || pLng == null) return false;
      if (lastAcc > LOCK_GOOD_ACCURACY_M) return false;
      if (elapsed >= TELEPORT_WINDOW_MS) return false;
      const d = distanceMeters(lat, lng, pLat, pLng);
      if (d <= TELEPORT_MAX_M) return false;
      const muchBetter = acc < lastAcc - 14 && acc <= 18;
      return !muchBetter;
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
        if (acc < lastAcc - 3) {
          if (!isSpuriousTeleport(lat, lng, acc, lastAcc, elapsed)) shouldWrite = true;
        } else if (acc <= 30 && elapsed >= 6000) {
          if (!isSpuriousTeleport(lat, lng, acc, lastAcc, elapsed)) shouldWrite = true;
        } else if (acc <= ACC_GOOD_M && elapsed >= 10_000) {
          if (!isSpuriousTeleport(lat, lng, acc, lastAcc, elapsed)) shouldWrite = true;
        } else if (acc <= ACC_OK_M && elapsed >= 22_000) {
          if (!isSpuriousTeleport(lat, lng, acc, lastAcc, elapsed)) shouldWrite = true;
        } else if (acc <= ACC_COARSE_M && elapsed >= 45_000) {
          if (!isSpuriousTeleport(lat, lng, acc, lastAcc, elapsed)) shouldWrite = true;
        } else if (elapsed >= 120_000 && acc <= Math.max(lastAcc * 1.4, 200)) {
          if (!isSpuriousTeleport(lat, lng, acc, lastAcc, elapsed)) shouldWrite = true;
        } else if (elapsed >= 240_000) {
          const b = bestRef.current;
          if (b && b.acc < acc) {
            shouldWrite = true;
            wLat = b.lat;
            wLng = b.lng;
            wAcc = b.acc;
          } else if (acc <= Math.max(lastAcc, 120) * 1.25) {
            if (!isSpuriousTeleport(lat, lng, acc, lastAcc, elapsed)) shouldWrite = true;
          }
        }
      }

      if (!shouldWrite) return;

      lastWriteAtRef.current = now;
      lastWrittenAccRef.current = wAcc;
      lastWrittenLatRef.current = wLat;
      lastWrittenLngRef.current = wLng;
      void writeStudentLiveLocation(uidTrim, wLat, wLng, wAcc).catch(() => {});
    };

    /** Немедленная запись координат (запрос админа «Обновить» или первый getCurrentPosition при входе). */
    const forcePublishFromAdminRefresh = (pos: GeolocationPosition) => {
      const acc = accuracyM(pos);
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const now = Date.now();
      updateBest(lat, lng, acc);
      lastWriteAtRef.current = now;
      lastWrittenAccRef.current = acc;
      lastWrittenLatRef.current = lat;
      lastWrittenLngRef.current = lng;
      void writeStudentLiveLocation(uidTrim, lat, lng, acc).catch(() => {});
    };

    const unsubRefresh = subscribeStudentLiveLocationRefreshRequests(uidTrim, () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => forcePublishFromAdminRefresh(pos),
        () => {},
        GEO_OPTIONS
      );
    });

    const maybeYandexLocator = async () => {
      const now = Date.now();
      if (now - lastLocatorAtRef.current < LOCATOR_MIN_INTERVAL_MS) return;
      const best = bestRef.current;
      if (best && best.acc <= LOCATOR_SKIP_IF_GPS_ACCURACY_M) return;

      lastLocatorAtRef.current = now;
      try {
        const { callLocatorLocate } = await import("@/firebase/locatorLocate");
        const r = await callLocatorLocate();
        if (!r.ok) return;

        const acc = r.accuracyM;
        const lastW = lastWrittenAccRef.current;
        const lastT = lastWriteAtRef.current;
        if (
          lastT > 0 &&
          lastW <= ACC_GOOD_M &&
          acc > Math.max(ACC_COARSE_M, lastW * 2)
        ) {
          return;
        }
        if (best && acc >= best.acc + 20) return;

        const pLat = lastWrittenLatRef.current;
        const pLng = lastWrittenLngRef.current;
        if (
          pLat != null &&
          pLng != null &&
          lastW <= LOCK_GOOD_ACCURACY_M &&
          Date.now() - lastT < TELEPORT_WINDOW_MS
        ) {
          const d = distanceMeters(r.lat, r.lng, pLat, pLng);
          if (d > TELEPORT_MAX_M && acc > 400) return;
        }

        updateBest(r.lat, r.lng, acc);
        lastWriteAtRef.current = now;
        lastWrittenAccRef.current = acc;
        lastWrittenLatRef.current = r.lat;
        lastWrittenLngRef.current = r.lng;
        void writeStudentLiveLocation(uidTrim, r.lat, r.lng, acc).catch(() => {});
      } catch {
        /* офлайн / функция не задеплоена */
      }
    };

    const tLocatorFirst = window.setTimeout(() => void maybeYandexLocator(), LOCATOR_FIRST_DELAY_MS);
    const tLocatorTick = window.setInterval(() => void maybeYandexLocator(), LOCATOR_INTERVAL_MS);

    void new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          forcePublishFromAdminRefresh(pos);
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
      unsubRefresh();
      window.clearTimeout(tLocatorFirst);
      window.clearInterval(tLocatorTick);
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      lastWriteAtRef.current = 0;
      lastWrittenAccRef.current = 999_999;
      lastWrittenLatRef.current = null;
      lastWrittenLngRef.current = null;
      sessionStartRef.current = 0;
      bestRef.current = null;
      lastLocatorAtRef.current = 0;
    };
  }, [uidTrim, active]);

  return null;
}
