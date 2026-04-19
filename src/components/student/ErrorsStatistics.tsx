import { useMemo } from "react";
import type { DrivingError, DrivingLesson } from "@/types/studentCabinet";

type ErrorsStatisticsProps = {
  errors: DrivingError[];
  lessonsCount: number;
  /** Для графика «штрафные баллы по урокам» (последние занятия). */
  lessons?: DrivingLesson[];
};

function errorPenaltySum(lesson: DrivingLesson): number {
  return lesson.errors.reduce((s, e) => s + e.points * e.count, 0);
}

/** Мини-график динамики суммарных штрафных баллов по урокам (хронологически). */
function ErrorTrendChart({ lessons }: { lessons: DrivingLesson[] }) {
  const series = useMemo(() => {
    const sorted = [...lessons].sort((a, b) => a.date - b.date);
    const last = sorted.slice(-12);
    return last.map((l) => ({ t: l.date, v: errorPenaltySum(l) }));
  }, [lessons]);

  if (series.length < 2) {
    return <p className="field-hint">Нужно минимум два урока для графика динамики.</p>;
  }
  const maxV = Math.max(1, ...series.map((p) => p.v));
  const w = 260;
  const h = 72;
  const pad = 4;
  const d = series
    .map((p, i) => {
      const x = pad + (i / (series.length - 1)) * (w - pad * 2);
      const y = pad + (1 - p.v / maxV) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="student-cabinet-trend">
      <h3 className="student-cabinet-subtitle">Динамика ошибок по урокам</h3>
      <p className="field-hint student-cabinet-trend-hint">
        Ось Y — сумма штрафных баллов за урок (ниже лучше).
      </p>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="student-cabinet-trend-svg" aria-hidden>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

/** Топ ошибок и простая «динамика» по последним урокам (по сумме баллов). */
export function ErrorsStatistics({ errors, lessonsCount, lessons = [] }: ErrorsStatisticsProps) {
  const top = useMemo(() => errors.slice(0, 5), [errors]);

  const catShare = useMemo(() => {
    const m = { traffic: 0, technique: 0, attention: 0 };
    for (const e of errors) {
      m[e.category] += e.count;
    }
    const t = m.traffic + m.technique + m.attention || 1;
    return {
      traffic: Math.round((m.traffic / t) * 100),
      technique: Math.round((m.technique / t) * 100),
      attention: Math.round((m.attention / t) * 100),
    };
  }, [errors]);

  const hint =
    top[0] != null
      ? `Чаще всего встречается: «${top[0].name}». Обратите на это внимание на следующем уроке.`
      : "Ошибок по журналу уроков пока нет — отличная работа.";

  const maxCount = top[0]?.count ?? 1;

  return (
    <section className="student-cabinet-card" aria-labelledby="student-cabinet-errors-title">
      <h2 id="student-cabinet-errors-title" className="student-cabinet-card__title">
        Статистика ошибок
      </h2>
      {lessonsCount === 0 ? (
        <p className="field-hint">После завершённых вождений здесь появится статистика.</p>
      ) : (
        <>
          <ul className="student-cabinet-error-bars">
            {top.map((e) => (
              <li key={e.id} className="student-cabinet-error-bar-row">
                <span className="student-cabinet-error-bar-name">{e.name}</span>
                <div className="student-cabinet-error-bar-track">
                  <span
                    className="student-cabinet-error-bar-fill"
                    style={{ width: `${Math.max(8, (e.count / maxCount) * 100)}%` }}
                  />
                </div>
                <span className="student-cabinet-error-bar-count">{e.count}</span>
              </li>
            ))}
          </ul>
          <h3 className="student-cabinet-subtitle">По категориям</h3>
          <ul className="student-cabinet-cat-list">
            <li>ПДД: {catShare.traffic}%</li>
            <li>Техника: {catShare.technique}%</li>
            <li>Внимание: {catShare.attention}%</li>
          </ul>
          {lessons.length >= 2 ? <ErrorTrendChart lessons={lessons} /> : null}
          <p className="student-cabinet-recommend">{hint}</p>
        </>
      )}
    </section>
  );
}
