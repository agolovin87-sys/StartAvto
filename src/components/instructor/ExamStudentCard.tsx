import type { InternalExamStudent } from "@/types/internalExam";

function formatExamStartedAt(ms: number): string {
  return new Date(ms).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ExamStudentCardProps = {
  student: InternalExamStudent;
  onStartExam: () => void;
  onViewSheet: () => void;
  startBusy?: boolean;
};

/**
 * Карточка курсанта в списке внутреннего экзамена.
 */
export function ExamStudentCard({
  student,
  onStartExam,
  onViewSheet,
  startBusy,
}: ExamStudentCardProps) {
  const statusLabel =
    student.status === "pending"
      ? "Не начат"
      : student.status === "in_progress"
        ? "Идёт экзамен"
        : student.status === "passed"
          ? "Сдан"
          : "Не сдан";

  const statusClass =
    student.status === "pending"
      ? "exam-student-card__status--pending"
      : student.status === "in_progress"
        ? "exam-student-card__status--progress"
        : student.status === "passed"
          ? "exam-student-card__status--pass"
          : "exam-student-card__status--fail";

  const done = student.status === "passed" || student.status === "failed";

  return (
    <div className={`exam-student-card exam-student-card--${student.status}`}>
      <div className="exam-student-card__main">
        <div className="exam-student-card__name">{student.studentName}</div>
        {student.studentGroup ? (
          <div className="exam-student-card__group">Группа: {student.studentGroup}</div>
        ) : null}
        <div className={`exam-student-card__status ${statusClass}`}>{statusLabel}</div>
        {done && student.totalPoints != null ? (
          <div className="exam-student-card__points">Баллы: {student.totalPoints}</div>
        ) : null}
      </div>
      <div className="exam-student-card__actions">
        {!done ? (
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={startBusy}
              onClick={onStartExam}
            >
              {student.status === "in_progress" ? "Продолжить экзамен" : "Начать экзамен"}
            </button>
            {student.examStartedAt != null ? (
              <span className="exam-student-card__started" title="Время нажатия «Начать экзамен»">
                Начало: {formatExamStartedAt(student.examStartedAt)}
              </span>
            ) : null}
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onViewSheet}>
              Экз.лист
            </button>
            {student.examStartedAt != null ? (
              <span className="exam-student-card__started" title="Время начала экзамена">
                Начало: {formatExamStartedAt(student.examStartedAt)}
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
