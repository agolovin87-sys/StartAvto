import { useEffect, useMemo, useState } from "react";
import { subscribeDriveTripForSlot } from "@/firebase/driveTripHistory";
import type { DrivingLesson } from "@/types/studentCabinet";
import type { Trip } from "@/types/tripHistory";

type LessonDetailsModalProps = {
  lesson: DrivingLesson;
  slotId: string;
  onClose: () => void;
};

/** Простой график скорости по точкам трека (подвыборка). */
function SpeedChart({ trip }: { trip: Trip | null }) {
  const pts = trip?.points ?? [];
  const series = useMemo(() => {
    if (pts.length < 2) return [];
    const step = Math.max(1, Math.floor(pts.length / 40));
    const out: { x: number; y: number }[] = [];
    let i = 0;
    for (let k = 0; k < pts.length; k += step) {
      const sp = pts[k].speed ?? 0;
      out.push({ x: i, y: Math.min(120, Math.max(0, sp)) });
      i += 1;
    }
    return out;
  }, [pts]);

  if (series.length < 2) {
    return <p className="field-hint">Нет точек трека для графика скорости.</p>;
  }
  const maxY = Math.max(30, ...series.map((p) => p.y));
  const w = 280;
  const h = 80;
  const d = series
    .map((p, idx) => {
      const x = (idx / (series.length - 1)) * w;
      const y = h - (p.y / maxY) * (h - 8);
      return `${idx === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="student-cabinet-speed-chart">
      <span className="student-cabinet-subtitle">Скорость по треку (км/ч, ориентир)</span>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="student-cabinet-speed-svg">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

/**
 * Детали урока: ошибки с баллами, комментарий, график скорости (live-подписка на трек).
 */
export function LessonDetailsModal({ lesson, slotId, onClose }: LessonDetailsModalProps) {
  const [trip, setTrip] = useState<Trip | null>(null);

  useEffect(() => {
    return subscribeDriveTripForSlot(slotId, setTrip);
  }, [slotId]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel student-cabinet-modal student-cabinet-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lesson-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lesson-detail-title" className="modal-title">
          Урок {new Date(lesson.date).toLocaleString("ru-RU")}
        </h2>
        <p className="field-hint">
          {lesson.instructorName} · {lesson.duration} мин · {lesson.distance ? `${lesson.distance} км` : "км —"}
        </p>
        {lesson.instructorComment ? (
          <blockquote className="student-cabinet-quote">{lesson.instructorComment}</blockquote>
        ) : (
          <p className="field-hint">Комментарий инструктора не указан.</p>
        )}
        <h3 className="student-cabinet-subtitle">Ошибки на уроке</h3>
        {lesson.errors.length === 0 ? (
          <p className="field-hint">Ошибок не отмечено.</p>
        ) : (
          <ul className="student-cabinet-detail-errors">
            {lesson.errors.map((e) => (
              <li key={e.id}>
                {e.name} — {e.points} б. ×{e.count}
              </li>
            ))}
          </ul>
        )}
        <SpeedChart trip={trip} />
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
