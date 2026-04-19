import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";

/** Норматив обязательных вождений по программе (для кольца прогресса). */
export const STUDENT_CABINET_REQUIRED_DRIVES = 29;

type DriveTier = {
  id: "novice" | "amateur" | "pro" | "expert";
  label: string;
  ringClass: string;
  badgeClass: string;
};

function tierForCompletedCount(n: number): DriveTier {
  const c = Math.max(0, Math.floor(n));
  if (c <= 7) {
    return {
      id: "novice",
      label: "Новичок",
      ringClass: "student-cab-drive-ring--novice",
      badgeClass: "student-cab-drive-badge--novice",
    };
  }
  if (c <= 15) {
    return {
      id: "amateur",
      label: "Любитель",
      ringClass: "student-cab-drive-ring--amateur",
      badgeClass: "student-cab-drive-badge--amateur",
    };
  }
  if (c <= 23) {
    return {
      id: "pro",
      label: "Профи",
      ringClass: "student-cab-drive-ring--pro",
      badgeClass: "student-cab-drive-badge--pro",
    };
  }
  return {
    id: "expert",
    label: "Эксперт",
    ringClass: "student-cab-drive-ring--expert",
    badgeClass: "student-cab-drive-badge--expert",
  };
}

/** Кольцо прогресса: доля завершённых вождений от 29, в центре — число. */
function DrivesRing({
  completed,
  total,
  tier,
}: {
  completed: number;
  total: number;
  tier: DriveTier;
}) {
  const frac = total <= 0 ? 0 : Math.max(0, Math.min(1, completed / total));
  const dash = `${frac * 100} ${100 - frac * 100}`;

  return (
    <div className={`student-cab-drive-ring-wrap ${tier.ringClass}`}>
      <svg className="student-cab-drive-ring-svg" viewBox="0 0 36 36" aria-hidden>
        <circle className="student-cab-drive-ring-bg" cx="18" cy="18" r="15.915" fill="none" strokeWidth="3" />
        <circle
          className="student-cab-drive-ring-fg"
          cx="18"
          cy="18"
          r="15.915"
          fill="none"
          strokeWidth="3"
          strokeDasharray={dash}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <div className="student-cab-drive-ring-center">
        <span className="student-cab-drive-ring-count">{completed}</span>
        <span className="student-cab-drive-ring-hint">из {total}</span>
      </div>
    </div>
  );
}

/**
 * Прогресс вождений: завершённые по профилю к нормативу 29, роль и цвет по количеству занятий.
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
      <p className="student-cab-drive-intro">
        Норматив программы: <strong>{total}</strong> обязательных вождений. В круге — ваше число завершённых
        занятий.
      </p>
      <div className="student-cab-drive-body">
        <DrivesRing completed={completed} total={total} tier={tier} />
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
