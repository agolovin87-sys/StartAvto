import { useMemo, useState } from "react";
import type { DrivingLesson } from "@/types/studentCabinet";
import { LessonDetailsModal } from "@/components/student/LessonDetailsModal";

const PAGE_SIZE = 10;

type DrivingLessonsListProps = {
  lessons: DrivingLesson[];
  /** Переход в раздел «История» с подсветкой строки поездки по слоту. */
  onOpenTrack: (driveSlotId: string) => void;
  onOpenExamPdf?: (examSheetId: string) => void;
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("ru-RU");
}

/**
 * Таблица уроков с пагинацией и модалкой деталей (ошибки, комментарий, график скорости из трека).
 */
export function DrivingLessonsList({ lessons, onOpenTrack, onOpenExamPdf }: DrivingLessonsListProps) {
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<DrivingLesson | null>(null);

  const totalPages = Math.max(1, Math.ceil(lessons.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages - 1);
  const slice = useMemo(() => {
    const start = pageClamped * PAGE_SIZE;
    return lessons.slice(start, start + PAGE_SIZE);
  }, [lessons, pageClamped]);

  return (
    <section className="student-cabinet-card" aria-labelledby="student-cabinet-lessons-title">
      <h2 id="student-cabinet-lessons-title" className="student-cabinet-card__title">
        Уроки вождения
      </h2>
      <div className="student-cabinet-table-wrap">
        <table className="admin-schedule-table student-cabinet-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Инструктор</th>
              <th>Мин</th>
              <th>Км</th>
              <th>Оценка</th>
              <th>Ошибки</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td colSpan={7} className="admin-schedule-table-empty">
                  Завершённых вождений пока нет.
                </td>
              </tr>
            ) : (
              slice.map((les) => {
                const errCount = les.errors.reduce((s, e) => s + e.count, 0);
                return (
                  <tr key={les.id}>
                    <td>{formatDate(les.date)}</td>
                    <td>{les.instructorName || "—"}</td>
                    <td>{les.duration}</td>
                    <td>{les.distance || "—"}</td>
                    <td>⭐ {les.rating.toFixed(1)}</td>
                    <td>
                      <span title="Число отмеченных ошибок на уроке">
                        🚫 {errCount > 0 ? errCount : "—"}
                      </span>
                    </td>
                    <td>
                      <div className="student-cabinet-row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setDetail(les)}
                        >
                          Подробнее
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => onOpenTrack(les.id)}
                        >
                          Трек
                        </button>
                        {les.type === "exam" && les.examSheetId && onOpenExamPdf ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => onOpenExamPdf(les.examSheetId!)}
                          >
                            Лист
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {lessons.length > PAGE_SIZE ? (
        <div className="student-cabinet-pagination">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pageClamped <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Назад
          </button>
          <span className="student-cabinet-page-meta">
            {pageClamped + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pageClamped >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Вперёд
          </button>
        </div>
      ) : null}
      {detail ? (
        <LessonDetailsModal lesson={detail} slotId={detail.id} onClose={() => setDetail(null)} />
      ) : null}
    </section>
  );
}
