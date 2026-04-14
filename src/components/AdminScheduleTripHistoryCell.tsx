import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { mapFirebaseError } from "@/firebase/errors";
import { subscribeDriveTripForSlot } from "@/firebase/driveTripHistory";
import type { DriveSlotStatus } from "@/types";
import type { Trip } from "@/types/tripHistory";
import { AdminTripTrackMap } from "@/components/AdminTripTrackMap";

function IconRoute() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden className="admin-trip-history-ico">
      <path
        fill="currentColor"
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"
      />
    </svg>
  );
}

export function AdminScheduleTripHistoryCell({
  slotId,
  slotStatus,
}: {
  slotId: string;
  /** Для текста, если трека нет, а занятие уже завершено. */
  slotStatus?: DriveSlotStatus;
}) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(null);
    return subscribeDriveTripForSlot(
      slotId,
      setTrip,
      (e) => setLoadError(mapFirebaseError(e))
    );
  }, [slotId]);

  const hasTrack = trip != null && trip.points.length > 0;
  const hasTripDocButNoPoints = trip != null && trip.points.length === 0;

  const modal =
    open && trip != null && hasTrack ? (
      <div
        className="modal-backdrop admin-trip-history-backdrop"
        role="presentation"
        onClick={() => setOpen(false)}
      >
        <div
          className="modal-panel admin-trip-history-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-trip-history-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="admin-trip-history-title" className="modal-title">
            История поездки
          </h2>
          <ul className="admin-trip-history-meta">
            <li>
              Дистанция:{" "}
              <strong>
                {trip.distance >= 1000
                  ? `${(trip.distance / 1000).toFixed(1)} км`
                  : `${Math.round(trip.distance)} м`}
              </strong>
            </li>
            <li>
              Длительность: <strong>{Math.floor(trip.duration / 60)} мин</strong>
            </li>
            <li>
              Средняя / макс. скорость:{" "}
              <strong>
                {trip.avgSpeed.toFixed(0)} / {trip.maxSpeed.toFixed(0)} км/ч
              </strong>
            </li>
            <li>
              Точек: <strong>{trip.points.length}</strong>
            </li>
          </ul>
          <AdminTripTrackMap points={trip.points} />
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
              Закрыть
            </button>
          </div>
        </div>
      </div>
    ) : open && !hasTrack ? (
      <div
        className="modal-backdrop admin-trip-history-backdrop"
        role="presentation"
        onClick={() => setOpen(false)}
      >
        <div
          className="modal-panel admin-trip-history-modal admin-trip-history-modal--empty"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-trip-history-empty-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="admin-trip-history-empty-title" className="modal-title">
            История поездки
          </h2>
          <p className="admin-trip-history-empty-text">
            {loadError ? (
              <>
                <strong>Не удалось загрузить данные трека.</strong> {loadError}
              </>
            ) : hasTripDocButNoPoints ? (
              <>
                В базе есть запись по этому занятию, но без координат маршрута. Обычно так бывает, если на
                устройстве инструктора не накопилось ни одной точки GPS (нет разрешения геолокации в браузере,
                сигнал недоступен или курсант не подтвердил начало — тогда запись трека не ведётся).
              </>
            ) : slotStatus === "completed" ? (
              <>
                Сохранённого трека по этому занятию нет. Трек отправляется в облако с устройства инструктора в
                момент завершения вождения: нужны разрешённая геолокация в браузере, подтверждение начала
                курсантом и стабильная сеть. Завершение занятия в системе возможно и без успешной отправки трека.
                Если проблема повторяется при нормальных условиях, проверьте публикацию правил Firestore для{" "}
                <code className="admin-inline-code">driveTripTracks</code>.
              </>
            ) : (
              <>
                Сохранённого GPS-трека по этому занятию пока нет. Трек появляется после завершения вождения,
                если у инструктора включена геолокация в браузере и курсант подтвердил начало урока. Для чтения
                трека админом должны быть опубликованы правила Firestore для коллекции{" "}
                <code className="admin-inline-code">driveTripTracks</code>.
              </>
            )}
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
              Закрыть
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <td className="admin-schedule-trip-history-cell">
      <div className="admin-trip-history-cell-row">
        <button
          type="button"
          className={`admin-trip-history-open-btn glossy-panel${
            hasTrack ? "" : " admin-trip-history-open-btn--muted"
          }`}
          onClick={() => setOpen(true)}
          title={
            hasTrack
              ? "Открыть трек на карте"
              : "История поездки: трек ещё не сохранён — нажмите для пояснения"
          }
          aria-label="История поездки"
        >
          <IconRoute />
        </button>
        <span className="admin-trip-history-inline-text">
          История поездки: {trip?.points.length ?? 0} точек GPS
        </span>
      </div>
      {typeof document !== "undefined" && modal != null
        ? createPortal(modal, document.body)
        : null}
    </td>
  );
}
