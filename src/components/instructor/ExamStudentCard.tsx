import type { InternalExamStudent } from "@/types/internalExam";

function IconPlay({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconContinueExam({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z" />
    </svg>
  );
}

function IconExamSheet({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"
      />
    </svg>
  );
}

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
              className="btn btn-primary btn-sm exam-student-card__btn exam-student-card__btn--start"
              disabled={startBusy}
              onClick={onStartExam}
            >
              {student.status === "in_progress" ? (
                <IconContinueExam className="exam-student-card__btn-ico" />
              ) : (
                <IconPlay className="exam-student-card__btn-ico" />
              )}
              <span>
                {student.status === "in_progress" ? "Продолжить экзамен" : "Начать экзамен"}
              </span>
            </button>
            {student.examStartedAt != null ? (
              <span className="exam-student-card__started" title="Время нажатия «Начать экзамен»">
                Начало: {formatExamStartedAt(student.examStartedAt)}
              </span>
            ) : null}
          </>
        ) : (
          <>
            <button
              type="button"
              className={`btn btn-ghost btn-sm exam-student-card__btn exam-student-card__btn--sheet exam-student-card__btn--sheet-${student.status === "passed" ? "pass" : "fail"}`}
              onClick={onViewSheet}
            >
              <IconExamSheet className="exam-student-card__btn-ico" />
              <span>Экз.лист</span>
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
