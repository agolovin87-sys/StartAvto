import { useMemo, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import { useAuth } from "@/context/AuthContext";
import { useStudentDriveLessons } from "@/hooks/useStudentDriveLessons";
import type { LessonDriveError } from "@/types/errorTemplate";
import type { DrivingLesson } from "@/types/studentCabinet";

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg className={`instr-chevron${open ? " is-open" : ""}`} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M7 10l5 5 5-5z" />
    </svg>
  );
}

function formatDateTime(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  const date = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

/** Ошибки в порядке отметок инструктора во время вождения (как в журнале урока). */
function sortedLessonErrors(
  slotId: string,
  errorsBySlot: Record<string, LessonDriveError[]>
): LessonDriveError[] {
  const rows = errorsBySlot[slotId] ?? [];
  return [...rows].sort((a, b) => a.timestamp - b.timestamp);
}

function formatErrorLine(e: LessonDriveError): string {
  return e.points > 0 ? `${e.name} (${e.points} б.)` : e.name;
}

/**
 * История завершённых вождений (по умолчанию свёрнута): ошибки из процесса урока; оценка — в разработке.
 */
export function StudentCabinetDrivingHistory() {
  const { user, profile } = useAuth();
  const uid = (user?.uid ?? profile?.uid ?? "").trim();
  const { lessons, errorsBySlot, loading, err } = useStudentDriveLessons(uid || undefined);
  const [open, setOpen] = useState(false);
  const [errorsModal, setErrorsModal] = useState<{
    date: string;
    time: string;
    instructorShort: string;
    errors: LessonDriveError[];
  } | null>(null);

  /** Хронология: первое вождение — № 1. */
  const rows = useMemo(() => [...lessons].sort((a, b) => a.date - b.date), [lessons]);

  return (
    <section className="student-cabinet-card student-cab-drive-history-card" aria-labelledby="cabinet-drive-history-title">
      {errorsModal ? (
        <div
          className="confirm-dialog-backdrop"
          role="presentation"
          onClick={() => setErrorsModal(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setErrorsModal(null);
          }}
        >
          <div
            className="confirm-dialog student-cab-drive-errors-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-drive-errors-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="student-drive-errors-dialog-title" className="confirm-dialog-title">
              Ошибки на уроке
            </h2>
            <p className="student-cab-drive-errors-dialog-meta">
              {errorsModal.date}, {errorsModal.time}
              {errorsModal.instructorShort !== "—" ? ` · ${errorsModal.instructorShort}` : ""}
            </p>
            <ol className="student-cab-drive-errors-dialog-list">
              {errorsModal.errors.map((e) => (
                <li key={e.id} className="student-cab-drive-errors-dialog-item">
                  {formatErrorLine(e)}
                </li>
              ))}
            </ol>
            <div className="confirm-dialog-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setErrorsModal(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        id="cabinet-drive-history-title"
        className="instructor-home-section-toggle glossy-panel student-cab-collapse-toggle"
        aria-expanded={open}
        aria-controls="cabinet-drive-history-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="instructor-home-section-toggle-label">История вождений</span>
        <span className="instructor-home-section-toggle-meta">{rows.length}</span>
        <IconChevron open={open} />
      </button>
      {loading ? (
        <p className="field-hint student-cab-collapse-loading" role="status">
          Загрузка…
        </p>
      ) : null}
      {err ? (
        <div className="form-error student-cab-collapse-err" role="alert">
          {err}
        </div>
      ) : null}
      <div
        id="cabinet-drive-history-panel"
        className="student-cab-collapse-panel"
        hidden={!open}
      >
        <p className="student-cab-drive-history-hint">
          Ошибки — отметки инструктора во время вождения. Оценка по завершении вождения (3–5 баллов) — в разработке.
        </p>
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
                rows.map((lesson: DrivingLesson, idx) => {
                  const { date, time } = formatDateTime(lesson.date);
                  const shortIns = lesson.instructorName ? formatShortFio(lesson.instructorName) : "—";
                  const errRows = sortedLessonErrors(lesson.id, errorsBySlot);
                  return (
                    <tr key={lesson.id}>
                      <td className="student-cab-drive-history-td-num">{idx + 1}</td>
                      <td>{date}</td>
                      <td>{time}</td>
                      <td className="student-cab-drive-history-td-ins">{shortIns}</td>
                      <td className="student-cab-drive-history-td-err">
                        {errRows.length === 0 ? (
                          "—"
                        ) : (
                          <button
                            type="button"
                            className="student-cabinet-text-link student-cab-drive-history-err-link"
                            onClick={() =>
                              setErrorsModal({
                                date,
                                time,
                                instructorShort: shortIns,
                                errors: errRows,
                              })
                            }
                          >
                            Посмотреть
                          </button>
                        )}
                      </td>
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
      </div>
    </section>
  );
}
