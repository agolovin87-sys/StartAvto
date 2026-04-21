import { useEffect, useMemo, useState } from "react";
import { subscribeDriveSlotsForInstructor } from "@/firebase/drives";
import { useAuth } from "@/context/AuthContext";
import type { DriveSlot } from "@/types";
import {
  addCalendarDaysToDateKey,
  scheduleMondayDateKeyForWeekContaining,
  weekDateKeysFromMondayDateKey,
} from "@/lib/scheduleTimezone";
import { IconInstructorCabinetWorkload } from "@/components/instructor/instructorCabinetSectionIcons";

const Y_MAX = 8;

/** Все дни пн–вс — как в «Мой график» (индексы 0..6 от понедельника). */
const X_AXIS_DAYS: { weekIndex: number; label: string }[] = [
  { weekIndex: 0, label: "Пн" },
  { weekIndex: 1, label: "Вт" },
  { weekIndex: 2, label: "Ср" },
  { weekIndex: 3, label: "Чт" },
  { weekIndex: 4, label: "Пт" },
  { weekIndex: 5, label: "Сб" },
  { weekIndex: 6, label: "Вс" },
];

/** Подписи оси Y: 8 … 0 (ноль — нет вождений). */
const Y_TICKS = [8, 7, 6, 5, 4, 3, 2, 1, 0] as const;

function formatRuDdMmYyyy(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!m) return dateKey;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** Как `slotsByDateKey` во вкладке «Главная» → «Мой график». */
function slotCountsAsWorkload(s: DriveSlot): boolean {
  return s.status === "scheduled" && Boolean(s.dateKey);
}

/**
 * График загруженности: число подтверждённых вождений (слотов) по дням — как в «Мой график».
 */
export function InstructorCabinetWorkloadSection() {
  const { user, profile } = useAuth();
  const uid = (user?.uid ?? profile?.uid ?? "").trim();
  const [slots, setSlots] = useState<DriveSlot[]>([]);
  const [weekMondayKey, setWeekMondayKey] = useState(() =>
    scheduleMondayDateKeyForWeekContaining()
  );

  useEffect(() => {
    if (!uid) {
      setSlots([]);
      return;
    }
    return subscribeDriveSlotsForInstructor(uid, setSlots, () => setSlots([]));
  }, [uid]);

  const weekKeys = useMemo(() => weekDateKeysFromMondayDateKey(weekMondayKey), [weekMondayKey]);
  const weekSundayKey = weekKeys[6] ?? weekMondayKey;
  const weekRangeLabel = `${formatRuDdMmYyyy(weekMondayKey)} — ${formatRuDdMmYyyy(weekSundayKey)}`;

  const drivesByDateKey = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const dk of weekKeys) {
      countMap.set(dk, 0);
    }
    for (const s of slots) {
      if (!slotCountsAsWorkload(s)) continue;
      if (!countMap.has(s.dateKey)) continue;
      countMap.set(s.dateKey, (countMap.get(s.dateKey) ?? 0) + 1);
    }
    return countMap;
  }, [slots, weekKeys]);

  const lineValues = useMemo(
    () =>
      X_AXIS_DAYS.map(({ weekIndex }) => {
        const dk = weekKeys[weekIndex] ?? "";
        return Math.min(Y_MAX, drivesByDateKey.get(dk) ?? 0);
      }),
    [drivesByDateKey, weekKeys]
  );

  const ariaSummary = X_AXIS_DAYS.map((d) => {
    const dk = weekKeys[d.weekIndex] ?? "";
    const n = drivesByDateKey.get(dk) ?? 0;
    return `${d.label}: ${n}${n > Y_MAX ? ` (на шкале до ${Y_MAX})` : ""}`;
  }).join(", ");
  const linePoints = useMemo(() => {
    const count = X_AXIS_DAYS.length;
    if (count === 0) return "";
    return lineValues
      .map((v, i) => {
        const x = count === 1 ? 0 : (i / (count - 1)) * 100;
        const y = 100 - (Math.max(0, Math.min(Y_MAX, v)) / Y_MAX) * 100;
        return `${x},${y}`;
      })
      .join(" ");
  }, [lineValues]);

  return (
    <section
      className="student-cabinet-card instructor-cabinet-block-surface instructor-cabinet-workload-section"
      aria-labelledby="instructor-cabinet-workload-title"
    >
      <h2
        id="instructor-cabinet-workload-title"
        className="student-cabinet-talon-head-title student-cab-title-with-ico instructor-cabinet-block-heading"
      >
        <IconInstructorCabinetWorkload className="instructor-cab-section-ico" />
        <span>График загруженности на неделю</span>
      </h2>

      <div className="instructor-cabinet-workload-head">
        <button
          type="button"
          className="instructor-cabinet-workload-nav"
          aria-label="Предыдущая неделя"
          onClick={() => setWeekMondayKey((k) => addCalendarDaysToDateKey(k, -7))}
        >
          ‹
        </button>
        <p className="instructor-cabinet-workload-week-label" role="status">
          Неделя с {weekRangeLabel}
        </p>
        <button
          type="button"
          className="instructor-cabinet-workload-nav"
          aria-label="Следующая неделя"
          onClick={() => setWeekMondayKey((k) => addCalendarDaysToDateKey(k, 7))}
        >
          ›
        </button>
      </div>

      <p className="field-hint instructor-cabinet-block-lead instructor-cabinet-workload-lead">
        {`Данные из «Мой график»: число записей со статусом «подтверждено» (scheduled) по каждому дню; по вертикали — вождений в день, шкала 0–${Y_MAX}.`}
      </p>

      <div
        className="instructor-cabinet-workload-chart-wrap"
        role="img"
        aria-label={`Загруженность за неделю ${weekRangeLabel}. Вождений по дням: ${ariaSummary}. Шкала до ${Y_MAX}.`}
      >
        <div className="instructor-cabinet-workload-chart-body">
          <div className="instructor-cabinet-workload-y-axis" aria-hidden>
            {Y_TICKS.map((n) => (
              <span key={n} className="instructor-cabinet-workload-y-tick">
                {n}
              </span>
            ))}
          </div>
          <div className="instructor-cabinet-workload-plot">
            <div className="instructor-cabinet-workload-grid" aria-hidden>
              {Y_TICKS.map((n) => (
                <div key={n} className="instructor-cabinet-workload-grid-line" />
              ))}
            </div>
            <div className="instructor-cabinet-workload-line-area">
              <svg
                className="instructor-cabinet-workload-line-svg"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden
              >
                <polyline
                  className="instructor-cabinet-workload-line"
                  points={linePoints}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="instructor-cabinet-workload-points">
                {X_AXIS_DAYS.map((d, i) => {
                  const v = lineValues[i] ?? 0;
                  const y = 100 - (Math.max(0, Math.min(Y_MAX, v)) / Y_MAX) * 100;
                  return (
                    <span
                      key={`${d.label}-point`}
                      className="instructor-cabinet-workload-point"
                      style={{ left: `${(i / Math.max(1, X_AXIS_DAYS.length - 1)) * 100}%`, top: `${y}%` }}
                      aria-hidden
                    />
                  );
                })}
              </div>
            </div>
            <div className="instructor-cabinet-workload-x-axis">
              {X_AXIS_DAYS.map((d) => {
                const raw = drivesByDateKey.get(weekKeys[d.weekIndex] ?? "") ?? 0;
                return (
                  <div key={d.label} className="instructor-cabinet-workload-col">
                    <span className="instructor-cabinet-workload-point-value" aria-hidden>
                      {raw > 0 ? raw : ""}
                    </span>
                    <span className="instructor-cabinet-workload-x-label">{d.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <p className="instructor-cabinet-workload-y-cap" aria-hidden>
          Вождений в день (0–{Y_MAX} на шкале; больше {Y_MAX} — линия у верха, число над точкой)
        </p>
      </div>
    </section>
  );
}
