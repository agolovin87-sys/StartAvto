import { useMemo } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import { useAuth } from "@/context/AuthContext";
import { useStudentDriveLessons } from "@/hooks/useStudentDriveLessons";
import type { DrivingLesson } from "@/types/studentCabinet";

function formatDateTime(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  const date = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

function errorsCell(lesson: DrivingLesson): string {
  if (!lesson.errors.length) return "—";
  return lesson.errors
    .map((e) => (e.count > 1 ? `${e.name} ×${e.count}` : e.name))
    .join("; ");
}

/**
 * История завершённых вождений: ошибки из журнала урока инструктора; оценка — в разработке.
 */
export function StudentCabinetDrivingHistory() {
  const { user, profile } = useAuth();
  const uid = (user?.uid ?? profile?.uid ?? "").trim();
  const { lessons, loading, err } = useStudentDriveLessons(uid || undefined);

  const rows = useMemo(() => [...lessons].sort((a, b) => b.date - a.date), [lessons]);

  return (
    <section className="student-cabinet-card student-cab-drive-history-card" aria-labelledby="cabinet-drive-history-title">
      <h2 id="cabinet-drive-history-title" className="student-cabinet-talon-head-title">
        История вождений
      </h2>
      <p className="student-cab-drive-history-hint">
        Ошибки — отметки инструктора во время урока. Оценка по завершении вождения (3–5 баллов) — в разработке.
      </p>
      {loading ? (
        <p className="field-hint" role="status">
          Загрузка…
        </p>
      ) : null}
      {err ? (
        <div className="form-error" role="alert">
          {err}
        </div>
      ) : null}
      <div className="student-cab-drive-history-table-wrap">
        <table className="student-cab-drive-history-table">
          <thead>
            <tr>
              <th className="student-cab-drive-history-th-num">№ п/п</th>
              <th>Дата</th>
              <th>Время</th>
              <th>Инструктор</th>
              <th>Ошибки</th>
              <th>Оценка</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="student-cab-drive-history-empty">
                  Завершённых вождений пока нет.
                </td>
              </tr>
            ) : (
              rows.map((lesson, idx) => {
                const { date, time } = formatDateTime(lesson.date);
                const shortIns = lesson.instructorName ? formatShortFio(lesson.instructorName) : "—";
                return (
                  <tr key={lesson.id}>
                    <td className="student-cab-drive-history-td-num">{idx + 1}</td>
                    <td>{date}</td>
                    <td>{time}</td>
                    <td className="student-cab-drive-history-td-ins">{shortIns}</td>
                    <td className="student-cab-drive-history-td-err">{errorsCell(lesson)}</td>
                    <td className="student-cab-drive-history-td-rating">
                      <span className="student-cab-drive-history-dev">В разработке</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
