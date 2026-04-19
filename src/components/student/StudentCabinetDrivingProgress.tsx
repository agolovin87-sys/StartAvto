import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";

/** Норматив обязательных вождений по программе (для кольца прогресса). */
export const STUDENT_CABINET_REQUIRED_DRIVES = 29;

/** Длина окружности в единицах stroke-dasharray (как у дуги прогресса). */
const RING_DASH_UNITS = 100;

/** Доли шкалы: 0–7, 8–15, 16–23, 24–28 (последний сегмент 5/29 до норматива 29). */
const DRIVE_SCALE_BANDS: readonly { lenUnits: number; color: string }[] = (() => {
  const d1 = 8;
  const d2 = 8;
  const d3 = 8;
  const d4 = STUDENT_CABINET_REQUIRED_DRIVES - d1 - d2 - d3;
  const u = RING_DASH_UNITS;
  const toUnits = (d: number) => (d / STUDENT_CABINET_REQUIRED_DRIVES) * u;
  return [
    { lenUnits: toUnits(d1), color: "#94a3b8" },
    { lenUnits: toUnits(d2), color: "#22d3ee" },
    { lenUnits: toUnits(d3), color: "#c084fc" },
    { lenUnits: toUnits(d4), color: "#fbbf24" },
  ];
})();

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

/** Кольцо: цветная шкала по диапазонам 0–7 / 8–15 / 16–23 / 24–29, сверху — дуга прогресса. */
function DrivesRing({ completed, total }: { completed: number; total: number }) {
  const frac = total <= 0 ? 0 : Math.max(0, Math.min(1, completed / total));
  const progressDash = `${frac * RING_DASH_UNITS} ${RING_DASH_UNITS - frac * RING_DASH_UNITS}`;
  const bandOffsets: number[] = [];
  let run = 0;
  for (const b of DRIVE_SCALE_BANDS) {
    bandOffsets.push(run);
    run += b.lenUnits;
  }
  return (
    <div className="student-cab-drive-ring-wrap">
      <svg className="student-cab-drive-ring-svg" viewBox="0 0 36 36" aria-hidden>
        <circle className="student-cab-drive-ring-bg" cx="18" cy="18" r="15.915" fill="none" strokeWidth="3" />
        {DRIVE_SCALE_BANDS.map((band, i) => {
          const len = band.lenUnits;
          const gap = RING_DASH_UNITS - len;
          return (
            <circle
              key={i}
              className="student-cab-drive-ring-scale"
              cx="18"
              cy="18"
              r="15.915"
              fill="none"
              strokeWidth="3"
              stroke={band.color}
              strokeDasharray={`${len} ${gap}`}
              strokeDashoffset={-(bandOffsets[i] ?? 0)}
              transform="rotate(-90 18 18)"
            />
          );
        })}
        <circle
          className="student-cab-drive-ring-fg student-cab-drive-ring-progress"
          cx="18"
          cy="18"
          r="15.915"
          fill="none"
          strokeWidth="3"
          strokeDasharray={progressDash}
          strokeLinecap="round"
          transform="rotate(-90 18 18)"
        />
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
