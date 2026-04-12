import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

const markerIcon = L.icon({
  iconRetinaUrl: iconRetina,
  iconUrl: iconUrl,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type Props = {
  lat: number;
  lng: number;
  /** Радиус погрешности в метрах (как сообщил браузер). */
  accuracyM: number | null;
};

/**
 * Карта OSM через Leaflet: те же координаты WGS84, что в Firestore (без iframe embed OSM, где маркер иногда «плывёт»).
 */
export function AdminGpsLeafletMap({ lat, lng, accuracyM }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const map = L.map(el, { zoomControl: true }).setView([lat, lng], 17);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    L.marker([lat, lng], { icon: markerIcon }).addTo(map);

    const rRaw =
      accuracyM != null && Number.isFinite(accuracyM) && accuracyM > 0 ? accuracyM : 35;
    const r = Math.min(8000, Math.max(5, rRaw));

    const circle = L.circle([lat, lng], {
      radius: r,
      color: "#38bdf8",
      weight: 2,
      fillColor: "#38bdf8",
      fillOpacity: 0.14,
    }).addTo(map);

    try {
      map.fitBounds(circle.getBounds(), { padding: [32, 32], maxZoom: 19, animate: false });
    } catch {
      map.setView([lat, lng], 17, { animate: false });
    }

    return () => {
      map.remove();
    };
  }, [lat, lng, accuracyM]);

  return <div ref={hostRef} className="admin-gps-leaflet-host" />;
}
