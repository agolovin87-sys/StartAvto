import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";

/** Норматив обязательных вождений по программе (для кольца прогресса). */
export const STUDENT_CABINET_REQUIRED_DRIVES = 29;

/** Длина окружности в единицах stroke-dasharray (как у дуги прогресса). */
const RING_DASH_UNITS = 100;

/**
 * Доли шкалы: 0–7 жёлтый, 8–15 зелёный, 16–23 фиолетовый, 24–29 синий.
 * Пока не достигнут порог уровня — сегмент рисуется цветом «неактивно» (белый в теме).
 */
const DRIVE_SCALE_BANDS: readonly { lenUnits: number; activeColor: string; minCompleted: number }[] = (() => {
  const d1 = 8;
  const d2 = 8;
  const d3 = 8;
  const d4 = STUDENT_CABINET_REQUIRED_DRIVES - d1 - d2 - d3;
  const u = RING_DASH_UNITS;
  const toUnits = (d: number) => (d / STUDENT_CABINET_REQUIRED_DRIVES) * u;
  return [
    { lenUnits: toUnits(d1), activeColor: "#fde047", minCompleted: 1 },
    { lenUnits: toUnits(d2), activeColor: "#4ade80", minCompleted: 8 },
    { lenUnits: toUnits(d3), activeColor: "#e879f9", minCompleted: 16 },
    { lenUnits: toUnits(d4), activeColor: "#38bdf8", minCompleted: 24 },
  ];
})();

const RING_RADIUS = 15.915;

/** Положение «ползунка» на кольце — конец дуги текущего прогресса (от 12 ч по часовой). */
function progressKnobXY(frac01: number): { x: number; y: number } {
  const f = Math.max(0, Math.min(1, frac01));
  const a = 2 * Math.PI * f;
  return { x: 18 + RING_RADIUS * Math.sin(a), y: 18 - RING_RADIUS * Math.cos(a) };
}

type DriveTier = {
  id: "novice" | "amateur" | "pro" | "expert";
  label: string;
  badgeClass: string;
};

function tierForCompletedCount(n: number): DriveTier {
  const c = Math.max(0, Math.floor(n));
  if (c <= 7) {
    return { id: "novice", label: "Новичок", badgeClass: "student-cab-drive-badge--novice" };
  }
  if (c <= 15) {
    return { id: "amateur", label: "Любитель", badgeClass: "student-cab-drive-badge--amateur" };
  }
  if (c <= 23) {
    return { id: "pro", label: "Профи", badgeClass: "student-cab-drive-badge--pro" };
  }
  return { id: "expert", label: "Эксперт", badgeClass: "student-cab-drive-badge--expert" };
}

/** Кольцо: цветная шкала; сверху — прошлый прогресс (до n−1) и текущий шаг (последнее занятие). */
function DrivesRing({ completed, total }: { completed: number; total: number }) {
  const u = RING_DASH_UNITS;
  const pastCompleted = Math.max(0, completed - 1);
  const pastFrac = total <= 0 ? 0 : Math.min(1, pastCompleted / total);
  const totalFrac = total <= 0 ? 0 : Math.min(1, completed / total);
  const sliceFrac = Math.max(0, totalFrac - pastFrac);
  const pastDash = `${pastFrac * u} ${u - pastFrac * u}`;
  const currentDash = `${sliceFrac * u} ${u - sliceFrac * u}`;
  const currentOffset = -pastFrac * u;
  const thumbPos =
    completed > 0 && totalFrac > 0 ? progressKnobXY(totalFrac) : null;
  const bandOffsets: number[] = [];
  let run = 0;
  for (const b of DRIVE_SCALE_BANDS) {
    bandOffsets.push(run);
    run += b.lenUnits;
  }
  return (
    <div className="student-cab-drive-ring-wrap">
      <svg
        className="student-cab-drive-ring-svg"
        viewBox="0 0 36 36"
        role="img"
        aria-label={
          completed > 0
            ? `Прогресс вождений: ${completed} из ${total}. Яркая точка — текущее положение на шкале.`
            : `Прогресс вождений: ${completed} из ${total}`
        }
      >
        <circle className="student-cab-drive-ring-bg" cx="18" cy="18" r="15.915" fill="none" strokeWidth="3" />
        {DRIVE_SCALE_BANDS.map((band, i) => {
          const len = band.lenUnits;
          const gap = RING_DASH_UNITS - len;
          const reached = completed >= band.minCompleted;
          return (
            <circle
              key={i}
              className="student-cab-drive-ring-scale"
              cx="18"
              cy="18"
              r="15.915"
              fill="none"
              stroke={reached ? band.activeColor : "var(--student-cab-drive-scale-inactive)"}
              strokeDasharray={`${len} ${gap}`}
              strokeDashoffset={-(bandOffsets[i] ?? 0)}
              transform="rotate(-90 18 18)"
            />
          );
        })}
        {pastFrac > 0 ? (
          <circle
            className="student-cab-drive-ring-fg student-cab-drive-ring-progress-past"
            cx="18"
            cy="18"
            r="15.915"
            fill="none"
            strokeDasharray={pastDash}
            transform="rotate(-90 18 18)"
          />
        ) : null}
        {completed > 0 && sliceFrac > 0 ? (
          <circle
            className="student-cab-drive-ring-fg student-cab-drive-ring-progress-current"
            cx="18"
            cy="18"
            r="15.915"
            fill="none"
            strokeDasharray={currentDash}
            strokeDashoffset={currentOffset}
            strokeLinecap="round"
            transform="rotate(-90 18 18)"
          />
        ) : null}
        {thumbPos ? (
          <circle className="student-cab-drive-ring-thumb" cx={thumbPos.x} cy={thumbPos.y} r="2.85" />
        ) : null}
      </svg>
      <div className="student-cab-drive-ring-center">
        <span className="student-cab-drive-ring-count">{completed}</span>
      </div>
    </div>
  );
}

/**
 * Прогресс вождений: завершённые по профилю к нормативу 29, роль по диапазону занятий.
 */
export function StudentCabinetDrivingProgress() {
  const { profile } = useAuth();
  const completed = profile?.drivesCount ?? 0;
  const total = STUDENT_CABINET_REQUIRED_DRIVES;
  const tier = useMemo(() => tierForCompletedCount(completed), [completed]);

  return (
    <section className="student-cabinet-card student-cab-drive-card" aria-labelledby="cabinet-drive-title">
      <h2 id="cabinet-drive-title" className="student-cabinet-talon-head-title">
        Прогресс вождений
      </h2>
      <div className="student-cab-drive-body">
        <DrivesRing completed={completed} total={total} />
        <div className="student-cab-drive-side">
          <p className="student-cab-drive-role-label">Текущий уровень</p>
          <p className={`student-cab-drive-badge ${tier.badgeClass}`}>{tier.label}</p>
          {completed > 0 ? (
            <p className="student-cab-drive-split-hint">
              <span className="student-cab-drive-split-hint-part">
                <span className="student-cab-drive-split-past" aria-hidden /> прошлый прогресс
              </span>
              <span aria-hidden>·</span>
              <span className="student-cab-drive-split-hint-part">
                <span className="student-cab-drive-split-current" aria-hidden /> текущий (последнее вождение)
              </span>
            </p>
          ) : null}
          <ul className="student-cab-drive-legend">
            <li>
              <span className="student-cab-drive-dot student-cab-drive-dot--novice" /> 0–7 — новичок
            </li>
            <li>
              <span className="student-cab-drive-dot student-cab-drive-dot--amateur" /> 8–15 — любитель
            </li>
            <li>
              <span className="student-cab-drive-dot student-cab-drive-dot--pro" /> 16–23 — профи
            </li>
            <li>
              <span className="student-cab-drive-dot student-cab-drive-dot--expert" /> 24–29 — эксперт
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
