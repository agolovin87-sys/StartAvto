import { useEffect, useRef, useState } from "react";
import { ensureYandexMapsLoaded, getYandexMapsApiKey } from "@/yandexMapsApi";

type Props = {
  lat: number;
  lng: number;
  accuracyM: number | null;
};

/**
 * Яндекс.Карты (JS API 2.1). Нужен `VITE_YANDEX_MAPS_API_KEY` в .env.
 * Координаты WGS84: центр [широта, долгота], как в Geolocation API.
 */
export function AdminGpsYandexMap({ lat, lng, accuracyM }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<YandexMapInstance | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    const apiKey = getYandexMapsApiKey();
    if (!el || !apiKey) return;

    let cancelled = false;
    setErr(null);

    void ensureYandexMapsLoaded(apiKey)
      .then(() => {
        if (cancelled || !hostRef.current) return;
        const ymaps = window.ymaps;
        if (!ymaps) return;

        mapRef.current?.destroy();
        mapRef.current = null;

        const center: [number, number] = [lat, lng];
        const map = new ymaps.Map(el, {
          center,
          zoom: 16,
          controls: ["zoomControl", "fullscreenControl"],
        });

        const rRaw =
          accuracyM != null && Number.isFinite(accuracyM) && accuracyM > 0 ? accuracyM : 35;
        const rM = Math.min(8000, Math.max(5, rRaw));

        const circle = new ymaps.Circle(
          [center, rM],
          {},
          {
            fillColor: "rgba(56, 189, 248, 0.18)",
            strokeColor: "#38bdf8",
            strokeOpacity: 0.95,
            strokeWidth: 2,
          }
        );

        const placemark = new ymaps.Placemark(
          center,
          { hintContent: "Точка по GPS", balloonContent: `${lat.toFixed(6)}, ${lng.toFixed(6)}` },
          { preset: "islands#blueCircleDotIcon" }
        );

        map.geoObjects.add(circle);
        map.geoObjects.add(placemark);

        try {
          const b = circle.geometry.getBounds();
          map.setBounds(b, { checkZoomRange: true, zoomMargin: 28 });
        } catch {
          /* */
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
  }, [lat, lng, accuracyM]);

  if (!getYandexMapsApiKey()) {
    return (
      <div className="admin-gps-yandex-missing">
        <p>
          Задайте в <code>.env</code> переменную <code>VITE_YANDEX_MAPS_API_KEY</code> (ключ JavaScript API и
          HTTP Геокодер в{" "}
          <a
            href="https://developer.tech.yandex.ru/services/"
            target="_blank"
            rel="noopener noreferrer"
            className="admin-gps-yandex-link"
          >
            кабинете разработчика Яндекса
          </a>
          ), затем пересоберите сайт.
        </p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="admin-gps-yandex-missing" role="alert">
        <p>Карта: {err}</p>
      </div>
    );
  }

  return <div ref={hostRef} className="admin-gps-yandex-host" />;
}
