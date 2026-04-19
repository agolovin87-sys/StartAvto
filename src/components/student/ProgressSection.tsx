import { useState } from "react";
import type { StudentProgress } from "@/types/studentCabinet";

type ProgressSectionProps = {
  progress: StudentProgress;
};

function ProgramModal({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal-panel student-cabinet-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Программа обучения</h2>
        <p className="field-hint">{text}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

/** Круговой процент программы + полосы теория/вождение + экзамены. */
export function ProgressSection({ progress }: ProgressSectionProps) {
  const [modal, setModal] = useState(false);
  const dash = `${progress.percentage} ${100 - progress.percentage}`;

  return (
    <section className="student-cabinet-card" aria-labelledby="student-cabinet-progress-title">
      <h2 id="student-cabinet-progress-title" className="student-cabinet-card__title">
        Прогресс обучения
      </h2>
      <div className="student-cabinet-progress-head">
        <svg className="student-cabinet-ring student-cabinet-ring--lg" viewBox="0 0 36 36" aria-hidden>
          <circle className="student-cabinet-ring-bg" cx="18" cy="18" r="15.915" fill="none" strokeWidth="3" />
          <circle
            className="student-cabinet-ring-fg student-cabinet-ring-fg--accent"
            cx="18"
            cy="18"
            r="15.915"
            fill="none"
            strokeWidth="3"
            strokeDasharray={dash}
            transform="rotate(-90 18 18)"
          />
        </svg>
        <div>
          <p className="student-cabinet-tickets-big">{progress.percentage}%</p>
          <p className="student-cabinet-tickets-sub">
            Пройдено ≈ {progress.completedHours.toFixed(1)} ч из {progress.totalHours} ч
          </p>
        </div>
      </div>
      <div className="student-cabinet-bar-block">
        <span className="student-cabinet-bar-label">Теория (оценка по внутренним данным)</span>
        <div className="student-cabinet-bar">
          <span className="student-cabinet-bar-fill" style={{ width: `${progress.theoryProgress}%` }} />
        </div>
        <span className="student-cabinet-bar-meta">{progress.theoryProgress}%</span>
      </div>
      <div className="student-cabinet-bar-block">
        <span className="student-cabinet-bar-label">Вождение</span>
        <div className="student-cabinet-bar">
          <span
            className="student-cabinet-bar-fill student-cabinet-bar-fill--drive"
            style={{ width: `${progress.drivingProgress}%` }}
          />
        </div>
        <span className="student-cabinet-bar-meta">{progress.drivingProgress}%</span>
      </div>
      <ul className="student-cabinet-exam-list">
        {progress.exams.map((ex) => (
          <li key={ex.type}>
            <span className="student-cabinet-exam-ico">
              {ex.status === "passed" ? "✅" : ex.status === "failed" ? "❌" : "⏳"}
            </span>
            <span>
              {ex.name}:{" "}
              {ex.status === "passed"
                ? "сдан"
                : ex.status === "failed"
                  ? "не сдан"
                  : "ожидает"}
              {ex.date ? ` (${new Date(ex.date).toLocaleDateString("ru-RU")})` : ""}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(true)}>
        Подробнее о программе
      </button>
      {modal ? (
        <ProgramModal
          text={`${progress.programName}. Объём программы: ${progress.totalHours} академических часов. Прогресс вождения оценивается по числу завершённых уроков и накопленному времени; теория — ориентировочно до уровня практики.`}
          onClose={() => setModal(false)}
        />
      ) : null}
    </section>
  );
}
