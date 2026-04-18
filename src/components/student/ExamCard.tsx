import type { StudentExamView } from "@/types/internalExam";

function formatRuDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type ExamCardProps = {
  exam: StudentExamView;
  onOpen: () => void;
  onDownload: () => void;
};

/**
 * Карточка экзамена для курсанта (предстоящий или завершённый).
 */
export function ExamCard({ exam, onOpen, onDownload }: ExamCardProps) {
  const upcoming = exam.status === "pending" || exam.status === "in_progress";
  const statusText =
    exam.status === "pending"
      ? "Ожидает экзамена"
      : exam.status === "in_progress"
        ? "Экзамен начат"
        : exam.status === "passed"
          ? "Сдан"
          : "Не сдан";

  const statusClass =
    exam.status === "pending"
      ? "student-exam-card__status--pending"
      : exam.status === "in_progress"
        ? "student-exam-card__status--progress"
        : exam.status === "passed"
          ? "student-exam-card__status--pass"
          : "student-exam-card__status--fail";

  return (
    <article className="student-exam-card">
      <h3 className="student-exam-card__title">Внутренний экзамен. Вождение</h3>
      <ul className="student-exam-card__list">
        <li>
          <span aria-hidden>📅</span> Дата: {formatRuDate(exam.examDate)}
        </li>
        <li>
          <span aria-hidden>⏰</span> Время: {exam.examTime}
        </li>
        <li>
          <span aria-hidden>👨‍🏫</span> Инструктор: {exam.instructorName}
        </li>
        <li className={`student-exam-card__status ${statusClass}`}>
          Статус: {statusText}
        </li>
      </ul>
      {upcoming ? (
        <p className="student-exam-card__hint">Приходите за 10 минут до начала.</p>
      ) : (
        <>
          <p className="student-exam-card__result">
            Результат: {exam.status === "passed" ? "СДАЛ ✅" : "НЕ СДАЛ ❌"}
            {exam.totalPoints != null ? (
              <>
                <br />
                Штрафные баллы: {exam.totalPoints}
              </>
            ) : null}
          </p>
          {exam.examSheetId ? (
            <div className="student-exam-card__pdf">
              <span className="student-exam-card__pdf-label">Экзаменационный лист:</span>
              <div className="student-exam-card__pdf-btns">
                <button type="button" className="btn btn-ghost btn-sm" onClick={onOpen}>
                  Открыть лист
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={onDownload}>
                  Экз.лист
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}
