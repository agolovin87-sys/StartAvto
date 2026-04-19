import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";

/** Норматив обязательных вождений по программе (для кольца прогресса). */
export const STUDENT_CABINET_REQUIRED_DRIVES = 29;

/** Узлы шкалы 0→29: цвет кольца плавно интерполируется между уровнями. */
const DRIVE_RING_STOPS: { f: number; rgb: readonly [number, number, number] }[] = [
  { f: 0, rgb: [148, 163, 184] }, // новичок
  { f: 8 / 29, rgb: [34, 211, 238] }, // любитель
  { f: 16 / 29, rgb: [192, 132, 252] }, // профи
  { f: 24 / 29, rgb: [251, 191, 36] }, // эксперт
  { f: 1, rgb: [251, 191, 36] },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Цвет обводки кольца по доле пройденного норматива (0…1), плавные переходы между уровнями. */
export function driveRingStrokeColor(frac01: number): string {
  const f = Math.max(0, Math.min(1, frac01));
  let i = 0;
  for (let j = 0; j < DRIVE_RING_STOPS.length - 1; j++) {
    if (f <= DRIVE_RING_STOPS[j + 1].f) {
      i = j;
      break;
    }
  }
  const a = DRIVE_RING_STOPS[i];
  const b = DRIVE_RING_STOPS[i + 1] ?? a;
  const denom = b.f - a.f;
  const t = denom <= 0 ? 0 : (f - a.f) / denom;
  const r = Math.round(lerp(a.rgb[0], b.rgb[0], t));
  const g = Math.round(lerp(a.rgb[1], b.rgb[1], t));
  const bl = Math.round(lerp(a.rgb[2], b.rgb[2], t));
  return `rgb(${r} ${g} ${bl})`;
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

/** Кольцо: заполнение по 29, цвет обводки — плавная шкала по уровням. */
function DrivesRing({
  completed,
  total,
  strokeColor,
}: {
  completed: number;
  total: number;
  strokeColor: string;
}) {
  const frac = total <= 0 ? 0 : Math.max(0, Math.min(1, completed / total));
  const dash = `${frac * 100} ${100 - frac * 100}`;

  return (
    <div className="student-cab-drive-ring-wrap">
      <svg className="student-cab-drive-ring-svg" viewBox="0 0 36 36" aria-hidden>
        <circle className="student-cab-drive-ring-bg" cx="18" cy="18" r="15.915" fill="none" strokeWidth="3" />
        <circle
          className="student-cab-drive-ring-fg"
          cx="18"
          cy="18"
          r="15.915"
          fill="none"
          strokeWidth="3"
          stroke={strokeColor}
          strokeDasharray={dash}
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
  const frac = total <= 0 ? 0 : Math.max(0, Math.min(1, completed / total));
  const strokeColor = useMemo(() => driveRingStrokeColor(frac), [frac]);

  return (
    <section className="student-cabinet-card student-cab-drive-card" aria-labelledby="cabinet-drive-title">
      <h2 id="cabinet-drive-title" className="student-cabinet-talon-head-title">
        Прогресс вождений
      </h2>
      <div className="student-cab-drive-body">
        <DrivesRing completed={completed} total={total} strokeColor={strokeColor} />
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
