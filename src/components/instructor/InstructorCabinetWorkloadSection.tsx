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

/** Колонки по ТЗ: Пн–Чт, Сб, Вс (без Пт). Индексы 0..6 от понедельника. */
const X_AXIS_DAYS: { weekIndex: number; label: string }[] = [
  { weekIndex: 0, label: "Пн" },
  { weekIndex: 1, label: "Вт" },
  { weekIndex: 2, label: "Ср" },
  { weekIndex: 3, label: "Чт" },
  { weekIndex: 5, label: "Сб" },
  { weekIndex: 6, label: "Вс" },
];

function formatRuDdMmYyyy(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!m) return dateKey;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function slotCountsAsWorkload(s: DriveSlot): boolean {
  if (s.status === "cancelled") return false;
  return Boolean(s.studentId?.trim());
}

/**
 * График загруженности: число уникальных курсантов с уроками по дням выбранной недели.
 */
export function InstructorCabinetWorkloadSection() {
  const { profile } = useAuth();
  const uid = profile?.uid?.trim() ?? "";
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

  const countsByDateKey = useMemo(() => {
    const setMap = new Map<string, Set<string>>();
    for (const dk of weekKeys) {
      setMap.set(dk, new Set());
    }
    for (const s of slots) {
      if (!slotCountsAsWorkload(s)) continue;
      const set = setMap.get(s.dateKey);
      if (!set) continue;
      set.add(s.studentId.trim());
    }
    const out = new Map<string, number>();
    for (const [dk, st] of setMap) {
      out.set(dk, st.size);
    }
    return out;
  }, [slots, weekKeys]);

  const barValues = useMemo(
    () =>
      X_AXIS_DAYS.map(({ weekIndex }) => {
        const dk = weekKeys[weekIndex] ?? "";
        return Math.min(Y_MAX, countsByDateKey.get(dk) ?? 0);
      }),
    [countsByDateKey, weekKeys]
  );

  const ariaSummary = X_AXIS_DAYS.map((d, i) => `${d.label}: ${barValues[i]}`).join(", ");

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
        По дням — число разных курсантов с запланированными или прошедшими уроками вождения (не
        отменёнными).
      </p>

      <div
        className="instructor-cabinet-workload-chart-wrap"
        role="img"
        aria-label={`Загруженность за неделю ${weekRangeLabel}. Курсантов по дням: ${ariaSummary}. Шкала до ${Y_MAX}.`}
      >
        <div className="instructor-cabinet-workload-chart-body">
          <div className="instructor-cabinet-workload-y-axis" aria-hidden>
            {Array.from({ length: Y_MAX }, (_, i) => Y_MAX - i).map((n) => (
              <span key={n} className="instructor-cabinet-workload-y-tick">
                {n}
              </span>
            ))}
          </div>
          <div className="instructor-cabinet-workload-plot">
            <div className="instructor-cabinet-workload-grid" aria-hidden>
              {Array.from({ length: Y_MAX }, (_, i) => (
                <div key={i} className="instructor-cabinet-workload-grid-line" />
              ))}
            </div>
            <div className="instructor-cabinet-workload-bars">
              {X_AXIS_DAYS.map((d, i) => {
                const raw = countsByDateKey.get(weekKeys[d.weekIndex] ?? "") ?? 0;
                const h = barValues[i] / Y_MAX;
                return (
                  <div key={d.label} className="instructor-cabinet-workload-col">
                    <span className="instructor-cabinet-workload-bar-value" aria-hidden>
                      {raw > 0 ? raw : ""}
                    </span>
                    <div className="instructor-cabinet-workload-bar-track">
                      <div
                        className="instructor-cabinet-workload-bar"
                        style={{ height: `${Math.max(0, Math.min(1, h)) * 100}%` }}
                      />
                    </div>
                    <span className="instructor-cabinet-workload-x-label">{d.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <p className="instructor-cabinet-workload-y-cap" aria-hidden>
          Курсантов (макс. {Y_MAX} на шкале)
        </p>
      </div>
    </section>
  );
}
