import type { TripError, TripPoint } from "@/types/tripHistory";

const EARTH_R_M = 6_371_000;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Расстояние между двумя точками WGS84, м. */
export function haversineM(a: TripPoint, b: TripPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function sumDistanceM(points: TripPoint[]): number {
  if (points.length < 2) return 0;
  let s = 0;
  for (let i = 1; i < points.length; i++) {
    s += haversineM(points[i - 1], points[i]);
  }
  return s;
}

/**
 * Средняя и макс. скорость по точкам с полем speed (км/ч); иначе оценка по сегментам (м/с → км/ч).
 */
export function speedsFromPoints(points: TripPoint[]): { avgKmh: number; maxKmh: number } {
  if (points.length === 0) return { avgKmh: 0, maxKmh: 0 };
  const fromGps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = (b.timestamp - a.timestamp) / 1000;
    if (dt <= 0.2) continue;
    const dM = haversineM(a, b);
    fromGps.push((dM / dt) * 3.6);
  }
  if (fromGps.length === 0) return { avgKmh: 0, maxKmh: 0 };
  let sum = 0;
  let max = 0;
  for (const v of fromGps) {
    sum += v;
    if (v > max) max = v;
  }
  return { avgKmh: sum / fromGps.length, maxKmh: max };
}

/** Простая эвристика событий (MVP). */
export function detectTripErrors(points: TripPoint[], maxSpeedKmh = 90): TripError[] {
  const out: TripError[] = [];
  let errIdx = 0;
  const { maxKmh } = speedsFromPoints(points);
  if (maxKmh > maxSpeedKmh && points.length > 0) {
    const mid = points[Math.floor(points.length / 2)];
    out.push({
      id: `spd-${errIdx++}`,
      type: "speeding",
      point: mid,
      severity: maxKmh > maxSpeedKmh + 30 ? "high" : "medium",
      description: `Превышение: до ${maxKmh.toFixed(0)} км/ч`,
    });
  }
  for (let i = 2; i < points.length; i++) {
    const a = points[i - 2];
    const b = points[i];
    const dt = (b.timestamp - a.timestamp) / 1000;
    if (dt <= 0) continue;
    const dM = haversineM(a, b);
    const v = (dM / dt) * 3.6;
    if (v < 5 && i > 2) {
      const prev = points[i - 3];
      const vPrev = haversineM(prev, points[i - 1]) / Math.max(0.001, (points[i - 1].timestamp - prev.timestamp) / 1000) * 3.6;
      if (vPrev > 25) {
        out.push({
          id: `brk-${errIdx++}`,
          type: "hard_brake",
          point: points[i - 1],
          severity: "medium",
          description: "Резкое снижение скорости",
        });
        break;
      }
    }
  }
  return out;
}
