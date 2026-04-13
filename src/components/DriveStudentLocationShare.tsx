import { useCallback, useEffect, useMemo, useState } from "react";
import { mapFirebaseError } from "@/firebase/errors";
import {
  formatDriveShareAddressLine,
  subscribeStudentDriveLocationShare,
  writeStudentDriveLocationShare,
  MAX_DRIVE_SHARE_COMMENT_LEN,
  type StudentDriveLocationShare,
} from "@/firebase/studentDriveLocationShare";
import { subscribeDriveSlot } from "@/firebase/drives";
import type { DriveSlot } from "@/types";
import { AdminGpsYandexMap } from "@/components/AdminGpsYandexMap";
import { StudentLocationPickMap } from "@/components/StudentLocationPickMap";
import {
  geocodeAddressTuymazyRegion,
  hasYandexMapsApiKey,
  reverseGeocodeCoordsYandex,
} from "@/yandexMapsApi";

const STALE_MS = 12 * 60 * 1000;

function formatAgo(ms: number | null): string {
  if (ms == null) return "—";
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}

function IconSendLocation() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"
      />
    </svg>
  );
}

function IconViewLocation() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 4C9 4 6.5 6.5 6.5 9.5c0 3.5 4 8.5 5.5 8.5s5.5-5 5.5-8.5C17.5 6.5 15 4 12 4zm0 6.5A2.5 2.5 0 1 1 12 8a2.5 2.5 0 0 1 0 5.5z"
      />
      <path fill="currentColor" d="M3 20h18v2H3v-2z" opacity="0.35" />
    </svg>
  );
}

function IconWhereAmI() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="student-loc-whereami-ico">
      <path
        fill="currentColor"
        d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"
      />
    </svg>
  );
}

function IconRemovePoint() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="student-loc-whereami-ico">
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  );
}

function yandexRouteToUrl(lat: number, lng: number): string {
  return `https://yandex.ru/maps/?rtext=~${lat},${lng}&rtt=auto`;
}

type PickedPoint = {
  lat: number;
  lng: number;
  accuracyM: number;
  /** Откуда взяты координаты — для подписи погрешности */
  source: "map" | "gps" | "manual" | "geocode";
};

function ManualLocationInputs({ onApply }: { onApply: (lat: number, lng: number) => void }) {
  const [latS, setLatS] = useState("");
  const [lngS, setLngS] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function apply() {
    const lat = parseFloat(latS.replace(",", "."));
    const lng = parseFloat(lngS.replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setErr("Введите числа");
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setErr("Допустимо: широта −90…90°, долгота −180…180°");
      return;
    }
    setErr(null);
    onApply(lat, lng);
  }

  return (
    <div className="student-loc-manual-fields">
      {err ? (
        <p className="form-error student-loc-manual-err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="student-loc-manual-row">
        <label className="student-loc-manual-label">
          Широта (WGS84)
          <input
            className="student-loc-manual-input"
            type="text"
            inputMode="decimal"
            value={latS}
            onChange={(e) => setLatS(e.target.value)}
            placeholder="55.751244"
            autoComplete="off"
          />
        </label>
        <label className="student-loc-manual-label">
          Долгота
          <input
            className="student-loc-manual-input"
            type="text"
            inputMode="decimal"
            value={lngS}
            onChange={(e) => setLngS(e.target.value)}
            placeholder="37.618423"
            autoComplete="off"
          />
        </label>
      </div>
      <button type="button" className="btn btn-secondary btn-sm student-loc-manual-apply" onClick={apply}>
        Установить точку
      </button>
    </div>
  );
}

function StudentShareLocationModal({
  open,
  onClose,
  slot,
  studentId,
}: {
  open: boolean;
  onClose: () => void;
  slot: DriveSlot;
  studentId: string;
}) {
  const [picked, setPicked] = useState<PickedPoint | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [whereAmIBusy, setWhereAmIBusy] = useState(false);
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [addressLine, setAddressLine] = useState("");
  const [locationComment, setLocationComment] = useState("");
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);

  const mapKey = hasYandexMapsApiKey();

  const setPointFromMap = useCallback((lat: number, lng: number) => {
    setPicked({ lat, lng, accuracyM: 1, source: "map" });
    setGeoErr(null);
  }, []);

  useEffect(() => {
    if (open) {
      setPicked(null);
      setAddressLine("");
      setLocationComment("");
      setGeoErr(null);
      setSendErr(null);
    }
  }, [open]);

  async function handleAddressFind() {
    setGeoErr(null);
    if (!addressLine.trim()) {
      setGeoErr("Введите адрес (улицу, дом)");
      return;
    }
    setGeocodeBusy(true);
    try {
      const coords = await geocodeAddressTuymazyRegion(addressLine);
      if (!coords) {
        setGeoErr("Адрес не найден. Уточните улицу и дом или укажите точку на карте.");
        return;
      }
      setPicked({ lat: coords.lat, lng: coords.lng, accuracyM: 1, source: "geocode" });
    } catch {
      setGeoErr("Не удалось найти адрес. Проверьте сеть и попробуйте снова.");
    } finally {
      setGeocodeBusy(false);
    }
  }

  function requestWhereAmI() {
    setGeoErr(null);
    if (!navigator.geolocation) {
      setGeoErr("Геолокация недоступна в браузере");
      return;
    }
    setWhereAmIBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPicked({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Math.max(1, pos.coords.accuracy),
          source: "gps",
        });
        setWhereAmIBusy(false);
      },
      (err) => {
        setWhereAmIBusy(false);
        const code = err?.code;
        if (code === 1) setGeoErr("Доступ к геолокации запрещён");
        else if (code === 2) setGeoErr("Местоположение недоступно");
        else if (code === 3) setGeoErr("Превышено время ожидания GPS");
        else setGeoErr("Не удалось получить координаты");
      },
      { enableHighAccuracy: true, timeout: 25_000, maximumAge: 0 }
    );
  }

  async function submit() {
    if (!picked || !studentId.trim() || slot.studentId !== studentId) return;
    setSendErr(null);
    setSendBusy(true);
    try {
      let addressLabel = "";
      if (hasYandexMapsApiKey()) {
        addressLabel = (await reverseGeocodeCoordsYandex(picked.lat, picked.lng)) ?? "";
      }
      if (!addressLabel.trim()) {
        addressLabel = `Координаты ${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}`;
      }
      const comment = locationComment.trim().slice(0, MAX_DRIVE_SHARE_COMMENT_LEN);
      await writeStudentDriveLocationShare(slot.id, {
        studentId,
        instructorId: slot.instructorId,
        lat: picked.lat,
        lng: picked.lng,
        accuracyM: picked.accuracyM,
        addressLabel,
        locationComment: comment,
      });
      onClose();
    } catch (e: unknown) {
      setSendErr(mapFirebaseError(e));
    } finally {
      setSendBusy(false);
    }
  }

  if (!open) return null;

  const selectedForMap = picked ? { lat: picked.lat, lng: picked.lng } : null;

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
        className="confirm-dialog admin-gps-modal student-loc-pick-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-share-loc-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-gps-modal-head">
          <h2 id="student-share-loc-title" className="confirm-dialog-title">
            Отправить место инструктору
          </h2>
        </div>
        <p className="confirm-dialog-message admin-gps-modal-hint">
          Нажмите на карте, чтобы поставить метку, при необходимости перетащите её. Кнопка «Где я» подставит ваше
          текущее местоположение по GPS. Под картой можно ввести адрес и нажать «Найти» — поиск ориентирован на{" "}
          <strong>Туймазы</strong> и <strong>Туймазинский район</strong> Республики Башкортостан.
        </p>

        <div className="student-loc-pick-toolbar">
          <button
            type="button"
            className="btn btn-secondary btn-sm student-loc-whereami-btn"
            onClick={() => void requestWhereAmI()}
            disabled={whereAmIBusy || sendBusy || geocodeBusy}
            aria-label="Где я"
            title="Где я"
          >
            <IconWhereAmI />
            <span className="student-loc-whereami-label">Где я</span>
          </button>
          {picked ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm student-loc-whereami-btn student-loc-clear-point-btn"
              onClick={() => setPicked(null)}
              disabled={sendBusy || geocodeBusy}
              aria-label="Убрать точку"
              title="Убрать точку"
            >
              <IconRemovePoint />
              <span className="student-loc-whereami-label">Убрать точку</span>
            </button>
          ) : null}
          {whereAmIBusy ? <span className="student-loc-toolbar-hint">Определение…</span> : null}
        </div>
        {geoErr ? (
          <p className="form-error student-loc-geo-err" role="alert">
            {geoErr}
          </p>
        ) : null}

        {mapKey ? (
          <>
            <div className="admin-gps-map-wrap student-loc-pick-map-wrap">
              <StudentLocationPickMap selected={selectedForMap} onSelect={setPointFromMap} />
            </div>
            <div className="student-loc-address-row">
              <label className="student-loc-address-field">
                <span className="student-loc-address-label-text">Адрес</span>
                <input
                  type="text"
                  className="student-loc-address-input"
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  placeholder="Улица, дом (поиск по Туймазам и району)"
                  autoComplete="street-address"
                  disabled={sendBusy || geocodeBusy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleAddressFind();
                    }
                  }}
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-sm student-loc-address-find-btn"
                onClick={() => void handleAddressFind()}
                disabled={sendBusy || geocodeBusy}
              >
                {geocodeBusy ? "Поиск…" : "Найти"}
              </button>
            </div>
            <label className="student-loc-comment-field">
              <span className="student-loc-address-label-text">Комментарий</span>
              <textarea
                className="student-loc-comment-textarea"
                value={locationComment}
                onChange={(e) =>
                  setLocationComment(e.target.value.slice(0, MAX_DRIVE_SHARE_COMMENT_LEN))
                }
                placeholder="Например: к стоянке магазина"
                rows={2}
                disabled={sendBusy}
              />
            </label>
          </>
        ) : (
          <div className="student-loc-no-key-wrap">
            <p className="admin-gps-modal-hint" role="status">
              Ключ <code>VITE_YANDEX_MAPS_API_KEY</code> не задан — укажите координаты вручную (WGS84).
            </p>
            <ManualLocationInputs
              onApply={(lat, lng) => setPicked({ lat, lng, accuracyM: 1, source: "manual" })}
            />
            <label className="student-loc-comment-field">
              <span className="student-loc-address-label-text">Комментарий</span>
              <textarea
                className="student-loc-comment-textarea"
                value={locationComment}
                onChange={(e) =>
                  setLocationComment(e.target.value.slice(0, MAX_DRIVE_SHARE_COMMENT_LEN))
                }
                placeholder="Например: к стоянке магазина"
                rows={2}
                disabled={sendBusy}
              />
            </label>
          </div>
        )}

        {picked ? (
          <p className="admin-gps-coords" title="WGS84">
            Точка: {picked.lat.toFixed(6)}, {picked.lng.toFixed(6)}
            {picked.source === "gps" ? (
              <span className="student-loc-acc-hint"> · по GPS ±{Math.round(picked.accuracyM)} м</span>
            ) : picked.source === "manual" ? (
              <span className="student-loc-acc-hint"> · введено вручную</span>
            ) : picked.source === "geocode" ? (
              <span className="student-loc-acc-hint"> · найдено по адресу</span>
            ) : (
              <span className="student-loc-acc-hint"> · выбрано на карте</span>
            )}
          </p>
        ) : (
          <p className="admin-gps-reality-hint student-loc-pick-prompt">Выберите точку на карте или введите координаты.</p>
        )}

        {sendErr ? (
          <p className="form-error student-loc-send-err" role="alert">
            {sendErr}
          </p>
        ) : null}

        <div className="confirm-dialog-actions drive-student-loc-modal-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={sendBusy}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void submit()}
            disabled={!picked || sendBusy}
          >
            {sendBusy ? "Отправка…" : "Отправить"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StudentDriveLocationShareButton({
  slot,
  studentId,
}: {
  slot: DriveSlot;
  studentId: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [liveStarted, setLiveStarted] = useState(() => slot.liveStartedAt != null);

  useEffect(() => {
    return subscribeDriveSlot(slot.id, (s) => setLiveStarted(s?.liveStartedAt != null));
  }, [slot.id]);

  if (liveStarted) return null;

  return (
    <>
      <button
        type="button"
        className="instr-side-btn instr-side-loc glossy-btn"
        onClick={() => setModalOpen(true)}
        aria-label="Отправить геолокацию инструктору"
        title="Отправить геолокацию инструктору"
      >
        <IconSendLocation />
      </button>
      <StudentShareLocationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        slot={slot}
        studentId={studentId}
      />
    </>
  );
}

function InstructorStudentLocationModal({
  open,
  onClose,
  share,
}: {
  open: boolean;
  onClose: () => void;
  share: StudentDriveLocationShare;
}) {
  const { lat, lng, accuracy, updatedAtMs } = share;
  const stale = updatedAtMs != null && Date.now() - updatedAtMs > STALE_MS;
  const yandexNav = useMemo(() => yandexRouteToUrl(lat, lng), [lat, lng]);
  const addressFormatted = formatDriveShareAddressLine(share);

  if (!open) return null;

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
        aria-labelledby="student-loc-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-gps-modal-head">
          <h2 id="student-loc-modal-title" className="confirm-dialog-title">
            Геолокация курсанта
          </h2>
        </div>
        <p className={`admin-gps-meta${stale ? " admin-gps-meta--stale" : ""}`}>
          Обновлено: {formatAgo(updatedAtMs)}
          {stale ? " — данные могли устареть" : ""}
          {Number.isFinite(accuracy) ? (
            <>
              {" "}
              · погрешность: ±{Math.round(accuracy)} м
            </>
          ) : null}
        </p>
        <p className="admin-gps-coords" title="WGS84">
          WGS84: {lat.toFixed(6)}, {lng.toFixed(6)}
        </p>
        {addressFormatted ? (
          <p className="admin-gps-coords drive-instructor-share-address-line" title="Адрес от курсанта">
            {addressFormatted}
          </p>
        ) : null}
        {!hasYandexMapsApiKey() ? (
          <p className="confirm-dialog-message admin-gps-modal-hint" role="status">
            Без ключа <code>VITE_YANDEX_MAPS_API_KEY</code> карта не подгрузится; навигация по ссылкам ниже
            доступна.
          </p>
        ) : (
          <p className="admin-gps-reality-hint">
            Координаты, выбранные курсантом на карте или по GPS.
          </p>
        )}
        <div className="admin-gps-map-wrap">
          <AdminGpsYandexMap
            key={`${lat}-${lng}-${accuracy}`}
            lat={lat}
            lng={lng}
            accuracyM={accuracy}
          />
        </div>
        <div className="confirm-dialog-actions drive-student-loc-modal-actions">
          <a
            className="btn btn-primary btn-sm"
            href={yandexNav}
            target="_blank"
            rel="noopener noreferrer"
          >
            Навигация
          </a>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

export function InstructorStudentLocationShareButton({ slotId }: { slotId: string }) {
  const [share, setShare] = useState<StudentDriveLocationShare | null>(null);
  const [open, setOpen] = useState(false);
  const [liveStarted, setLiveStarted] = useState(false);

  useEffect(() => {
    return subscribeDriveSlot(slotId, (s) => setLiveStarted(s?.liveStartedAt != null));
  }, [slotId]);

  useEffect(() => {
    return subscribeStudentDriveLocationShare(slotId, setShare);
  }, [slotId]);

  useEffect(() => {
    if (!share) setOpen(false);
  }, [share]);

  if (liveStarted) return null;
  if (!share) return null;

  return (
    <>
      <button
        type="button"
        className="instr-side-btn instr-side-loc glossy-btn"
        onClick={() => setOpen(true)}
        aria-label="Посмотреть геолокацию курсанта"
        title="Посмотреть геолокацию"
      >
        <IconViewLocation />
      </button>
      <InstructorStudentLocationModal
        open={open}
        onClose={() => setOpen(false)}
        share={share}
      />
    </>
  );
}
