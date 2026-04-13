import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Trip } from "@/types/tripHistory";
import { subscribeDriveTripForSlot } from "@/firebase/driveTripHistory";
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

export function AdminScheduleTripHistoryCell({ slotId }: { slotId: string }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    return subscribeDriveTripForSlot(slotId, setTrip, () => {});
  }, [slotId]);

  const hasTrack = trip != null && trip.points.length > 0;

  const modal =
    open && hasTrack && trip ? (
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
    ) : null;

  return (
    <td className="admin-schedule-trip-history-cell">
      {hasTrack ? (
        <button
          type="button"
          className="admin-trip-history-open-btn glossy-panel"
          onClick={() => setOpen(true)}
          title="История поездки на карте"
          aria-label="История поездки на карте"
        >
          <IconRoute />
        </button>
      ) : (
        <span className="admin-schedule-trip-empty">—</span>
      )}
      {typeof document !== "undefined" && modal != null
        ? createPortal(modal, document.body)
        : null}
    </td>
  );
}
