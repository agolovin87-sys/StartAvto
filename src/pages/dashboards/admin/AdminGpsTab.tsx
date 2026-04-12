import { useEffect, useMemo, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import { subscribeInstructors } from "@/firebase/admin";
import {
  subscribeInstructorLiveLocation,
  type InstructorLiveLocation,
} from "@/firebase/instructorLiveLocation";
import type { UserProfile } from "@/types";

const STALE_MS = 12 * 60 * 1000;

function osmEmbedSrc(lat: number, lng: number): string {
  const d = 0.014;
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}

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
  title,
  location,
  onClose,
}: {
  open: boolean;
  title: string;
  location: InstructorLiveLocation | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const { lat, lng, updatedAtMs } = location ?? { lat: 0, lng: 0, updatedAtMs: null };
  const hasPoint = location != null && Number.isFinite(lat) && Number.isFinite(lng);
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
        <h2 id="admin-gps-modal-title" className="confirm-dialog-title">
          {title}
        </h2>
        {!hasPoint ? (
          <p className="confirm-dialog-message admin-gps-modal-hint">
            Нет данных о местоположении. Инструктору нужно открыть кабинет и разрешить доступ к геолокации в
            браузере.
          </p>
        ) : (
          <>
            <p className={`admin-gps-meta${stale ? " admin-gps-meta--stale" : ""}`}>
              Обновлено: {formatAgo(updatedAtMs)}
              {stale ? " — данные могли устареть" : ""}
            </p>
            <div className="admin-gps-map-wrap">
              <iframe
                title="Карта"
                src={osmEmbedSrc(lat, lng)}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
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
        Местоположение инструкторов обновляется, пока у них открыт личный кабинет и разрешена геолокация.
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
        title={modalTitle}
        location={live}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
