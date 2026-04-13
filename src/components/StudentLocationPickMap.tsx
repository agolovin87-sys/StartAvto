import { useEffect, useRef, useState } from "react";
import { useHaptics } from "@/hooks/useHaptics";
import { ensureYandexMapsLoaded, getYandexMapsApiKey, hasYandexMapsApiKey } from "@/yandexMapsApi";

type Props = {
  selected: { lat: number; lng: number } | null;
  onSelect: (lat: number, lng: number) => void;
};

/** Туймазы, Республика Башкортостан — стартовый центр карты. */
const DEFAULT_CENTER: [number, number] = [54.6066, 53.7097];

type YMapLike = {
  destroy: () => void;
  geoObjects: { add: (o: unknown) => void; remove: (o: unknown) => void };
  setCenter: (c: [number, number], z?: number, opts?: Record<string, unknown>) => void;
  events: { add: (name: string, handler: (e: YMapClickEvent) => void) => void };
};

type YMapClickEvent = { get: (name: string) => [number, number] };

type PlacemarkLike = {
  geometry: { setCoordinates: (c: [number, number]) => void; getCoordinates: () => [number, number] };
  events: { add: (name: string, handler: () => void) => void };
};

/**
 * Карта Яндекса: клик и перетаскивание метки задают точку (WGS84).
 */
export function StudentLocationPickMap({ selected, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<YMapLike | null>(null);
  const placemarkRef = useRef<PlacemarkLike | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const { light } = useHaptics();
  const hapticLightRef = useRef(light);
  hapticLightRef.current = light;

  const [mapErr, setMapErr] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    const apiKey = getYandexMapsApiKey();
    if (!el || !apiKey) return;

    let cancelled = false;
    setMapErr(null);

    void ensureYandexMapsLoaded(apiKey)
      .then(() => {
        if (cancelled || !hostRef.current || !window.ymaps) return;
        const ymaps = window.ymaps;

        const map = new ymaps.Map(el, {
          center: DEFAULT_CENTER,
          zoom: 10,
          controls: ["zoomControl", "fullscreenControl"],
        }) as unknown as YMapLike;

        mapRef.current = map;

        map.events.add("click", (e: YMapClickEvent) => {
          hapticLightRef.current();
          const c = e.get("coords");
          onSelectRef.current(c[0], c[1]);
        });

        setMapReady(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) setMapErr(e instanceof Error ? e.message : "Ошибка карты");
      });

    return () => {
      cancelled = true;
      placemarkRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.ymaps) return;
    const ymaps = window.ymaps;
    const map = mapRef.current;

    if (!selected) {
      if (placemarkRef.current) {
        try {
          map.geoObjects.remove(placemarkRef.current);
        } catch {
          /* */
        }
        placemarkRef.current = null;
      }
      return;
    }

    const coords: [number, number] = [selected.lat, selected.lng];

    if (!placemarkRef.current) {
      const pm = new ymaps.Placemark(
        coords,
        {
          hintContent: "Выбранная точка",
          balloonContent: `${selected.lat.toFixed(6)}, ${selected.lng.toFixed(6)}`,
        },
        { preset: "islands#blueDotIcon", draggable: true }
      ) as unknown as PlacemarkLike;

      pm.events.add("dragend", () => {
        hapticLightRef.current();
        const p = pm.geometry.getCoordinates();
        onSelectRef.current(p[0], p[1]);
      });

      map.geoObjects.add(pm);
      placemarkRef.current = pm;
    } else {
      placemarkRef.current.geometry.setCoordinates(coords);
    }

    map.setCenter(coords, 16);
  }, [mapReady, selected]);

  if (!hasYandexMapsApiKey()) {
    return null;
  }

  if (mapErr) {
    return (
      <div className="admin-gps-yandex-missing" role="alert">
        <p>Карта: {mapErr}</p>
      </div>
    );
  }

  return <div ref={hostRef} className="admin-gps-yandex-host" />;
}
