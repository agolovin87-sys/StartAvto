import { useEffect, useRef, useState } from "react";
import type { TripPoint } from "@/types/tripHistory";
import { ensureYandexMapsLoaded, getYandexMapsApiKey } from "@/yandexMapsApi";

type Props = {
  points: TripPoint[];
};

/**
 * Карта с линией трека (WGS84). Нужен `VITE_YANDEX_MAPS_API_KEY`.
 */
export function AdminTripTrackMap({ points }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<YandexMapInstance | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    const apiKey = getYandexMapsApiKey();
    if (!el || !apiKey || points.length === 0) return;

    let cancelled = false;
    setErr(null);

    void ensureYandexMapsLoaded(apiKey)
      .then(() => {
        if (cancelled || !hostRef.current) return;
        const ymaps = window.ymaps;
        if (!ymaps) return;

        mapRef.current?.destroy();
        mapRef.current = null;

        const coords: [number, number][] = points.map((p) => [p.lat, p.lng]);
        const center = coords[Math.floor(coords.length / 2)] ?? coords[0];

        const map = new ymaps.Map(el, {
          center,
          zoom: 14,
          controls: ["zoomControl", "fullscreenControl"],
        });

        if (coords.length >= 2) {
          const polyline = new ymaps.Polyline(
            coords,
            {},
            {
              strokeColor: "#16a34a",
              strokeWidth: 5,
              strokeOpacity: 0.9,
            }
          );
          map.geoObjects.add(polyline);
          try {
            const b = polyline.geometry.getBounds();
            if (b) map.setBounds(b, { checkZoomRange: true, zoomMargin: 36 });
          } catch {
            /* */
          }
        } else {
          const placemark = new ymaps.Placemark(
            center,
            { hintContent: "Точка трека", balloonContent: "Одна точка" },
            { preset: "islands#greenCircleDotIcon" }
          );
          map.geoObjects.add(placemark);
        }

        mapRef.current = map;
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Ошибка карты");
      });

    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [points]);

  if (!getYandexMapsApiKey()) {
    return (
      <div className="admin-gps-yandex-missing">
        <p>
          Задайте <code>VITE_YANDEX_MAPS_API_KEY</code> для карты трека.
        </p>
      </div>
    );
  }

  if (points.length === 0) {
    return <p className="field-hint">Нет точек для отображения.</p>;
  }

  if (err) {
    return (
      <div className="admin-gps-yandex-missing" role="alert">
        <p>{err}</p>
      </div>
    );
  }

  return <div ref={hostRef} className="admin-gps-yandex-host admin-trip-track-map-host" />;
}
