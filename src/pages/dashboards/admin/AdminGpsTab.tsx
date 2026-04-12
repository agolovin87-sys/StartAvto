import { useCallback, useEffect, useMemo, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import { AdminGpsYandexMap } from "@/components/AdminGpsYandexMap";
import { subscribeInstructors } from "@/firebase/admin";
import {
  fetchInstructorLiveLocationFromServer,
  subscribeInstructorLiveLocation,
  type InstructorLiveLocation,
} from "@/firebase/instructorLiveLocation";
import type { UserProfile } from "@/types";
import { hasYandexMapsApiKey } from "@/yandexMapsApi";

const STALE_MS = 12 * 60 * 1000;

function formatAgo(ms: number | null): string {
  if (ms == null) return "";
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}

function AdminGpsMapModal({
  open,
  instructorUid,
  subscriptionLocation,
  title,
  onClose,
}: {
  open: boolean;
  instructorUid: string;
  subscriptionLocation: InstructorLiveLocation | null;
  title: string;
  onClose: () => void;
}) {
  const [display, setDisplay] = useState<InstructorLiveLocation | null>(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [mapNonce, setMapNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setDisplay(subscriptionLocation);
  }, [open, subscriptionLocation]);

  const handleRefresh = useCallback(async () => {
    const uid = instructorUid.trim();
    if (!uid) return;
    setRefreshBusy(true);
    try {
      const next = await fetchInstructorLiveLocationFromServer(uid);
      setDisplay(next);
      setMapNonce((n) => n + 1);
    } finally {
      setRefreshBusy(false);
    }
  }, [instructorUid]);

  if (!open) return null;

  const { lat, lng, updatedAtMs, accuracyM } = display ?? {
    lat: 0,
    lng: 0,
    updatedAtMs: null,
    accuracyM: null,
  };
  const hasPoint = display != null && Number.isFinite(lat) && Number.isFinite(lng);
  const stale = updatedAtMs != null && Date.now() - updatedAtMs > STALE_MS;

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="confirm-dialog admin-gps-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-gps-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-gps-modal-head">
          <h2 id="admin-gps-modal-title" className="confirm-dialog-title">
            {title}
          </h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm admin-gps-refresh-btn"
            disabled={refreshBusy}
            onClick={() => void handleRefresh()}
            aria-busy={refreshBusy}
            title="Загрузить последние координаты с сервера"
          >
            {refreshBusy ? "…" : "Обновить"}
          </button>
        </div>
        {!hasPoint ? (
          <p className="confirm-dialog-message admin-gps-modal-hint">
            Нет данных о местоположении. Инструктору нужно открыть кабинет и разрешить доступ к геолокации в
            браузере. Точность зависит от GPS телефона; метр и меньше в вебе недостижимы без спец. оборудования.
          </p>
        ) : (
          <>
            <p className={`admin-gps-meta${stale ? " admin-gps-meta--stale" : ""}`}>
              Обновлено: {formatAgo(updatedAtMs)}
              {stale ? " — данные могли устареть" : ""}
              {accuracyM != null ? (
                <>
                  {" "}
                  · браузер сообщил погрешность: ±{Math.round(accuracyM)} м (не всегда совпадает с реальностью)
                </>
              ) : null}
            </p>
            <p className="admin-gps-coords" title="WGS84 — как в GPS-навигаторах">
              WGS84: {lat.toFixed(6)}, {lng.toFixed(6)}
            </p>
            <p className="admin-gps-reality-hint">
              Координаты с устройства инструктора; карта — те же WGS84. Погрешность в километры обычно значит
              сеть/Wi‑Fi вместо GPS — на улице с включённой точной геолокацией обычно лучше.
              {!hasYandexMapsApiKey() ? (
                <>
                  {" "}
                  Без ключа <code>VITE_YANDEX_MAPS_API_KEY</code> в <code>.env</code> и пересборки карта не
                  подгрузится.
                </>
              ) : null}
            </p>
            <div className="admin-gps-map-wrap">
              <AdminGpsYandexMap
                key={`${lat}-${lng}-${accuracyM ?? "x"}-${mapNonce}`}
                lat={lat}
                lng={lng}
                accuracyM={accuracyM}
              />
            </div>
          </>
        )}
        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminGpsTab() {
  const [instructors, setInstructors] = useState<UserProfile[]>([]);
  const [listErr, setListErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [live, setLive] = useState<InstructorLiveLocation | null>(null);

  useEffect(() => {
    return subscribeInstructors(
      (list) => {
        setListErr(null);
        const active = list.filter((u) => u.accountStatus === "active");
        active.sort((a, b) =>
          a.displayName.localeCompare(b.displayName, "ru", { sensitivity: "base" })
        );
        setInstructors(active);
      },
      (e) => setListErr(e.message)
    );
  }, []);

  useEffect(() => {
    const uid = selected?.uid?.trim() ?? "";
    if (!uid) {
      setLive(null);
      return () => {};
    }
    return subscribeInstructorLiveLocation(uid, setLive);
  }, [selected?.uid]);

  const modalTitle = selected
    ? `Геолокация: ${formatShortFio(selected.displayName)}`
    : "";

  const buttons = useMemo(
    () =>
      instructors.map((ins) => (
        <button
          key={ins.uid}
          type="button"
          className="btn btn-secondary admin-gps-instructor-btn"
          onClick={() => setSelected(ins)}
        >
          {formatShortFio(ins.displayName)}
        </button>
      )),
    [instructors]
  );

  return (
    <div className="admin-tab admin-gps-tab">
      <h1 className="admin-tab-title">GPS</h1>
      <p className="admin-tab-lead">
        Координаты в режиме высокой точности (GPS). На телефоне держите инструктору открытым кабинет и разрешите
        геолокацию; под открытым небом точность обычно лучше, чем в помещении.
      </p>
      {listErr ? (
        <div className="form-error" role="alert">
          {listErr}
        </div>
      ) : null}
      {instructors.length === 0 ? (
        <p className="admin-empty">Нет активных инструкторов.</p>
      ) : (
        <div className="admin-gps-btn-grid" role="list">
          {buttons}
        </div>
      )}
      <AdminGpsMapModal
        open={selected != null}
        instructorUid={selected?.uid ?? ""}
        subscriptionLocation={live}
        title={modalTitle}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
