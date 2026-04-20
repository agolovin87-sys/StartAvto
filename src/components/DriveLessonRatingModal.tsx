import { useEffect, useState } from "react";

type DriveLessonRatingModalProps = {
  open: boolean;
  variant: "student" | "instructor";
  busy?: boolean;
  error?: string | null;
  onSubmit: (value: number) => void;
  onClose: () => void;
};

/**
 * После «Вождение завершено»: оценка инструктора курсантом (1–5 звёзд) или курсанта инструктором (3–5).
 */
export function DriveLessonRatingModal({
  open,
  variant,
  busy = false,
  error = null,
  onSubmit,
  onClose,
}: DriveLessonRatingModalProps) {
  const [stars, setStars] = useState(0);
  const [grade, setGrade] = useState<0 | 3 | 4 | 5>(0);

  useEffect(() => {
    if (open) {
      setStars(0);
      setGrade(0);
    }
  }, [open]);

  if (!open) return null;

  const title =
    variant === "student"
      ? "Поставьте оценку инструктору"
      : "Поставьте оценку курсанту";

  function handleSubmit() {
    if (variant === "student") {
      if (stars < 1 || stars > 5) return;
      onSubmit(stars);
    } else {
      if (grade !== 3 && grade !== 4 && grade !== 5) return;
      onSubmit(grade);
    }
  }

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onClick={() => !busy && onClose()}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onClose();
      }}
    >
      <div
        className="confirm-dialog drive-lesson-rating-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drive-lesson-rating-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="drive-lesson-rating-title" className="confirm-dialog-title">
          {title}
        </h2>
        {variant === "student" ? (
          <div className="drive-lesson-rating-stars" role="group" aria-label="Оценка от 1 до 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`drive-lesson-rating-star${n <= stars ? " is-on" : ""}`}
                aria-pressed={n <= stars}
                aria-label={`${n} из 5`}
                disabled={busy}
                onClick={() => setStars(n)}
              >
                ★
              </button>
            ))}
          </div>
        ) : (
          <div className="drive-lesson-rating-grades" role="group" aria-label="Оценка 3, 4 или 5">
            {([3, 4, 5] as const).map((g) => (
              <button
                key={g}
                type="button"
                className={`btn btn-sm drive-lesson-rating-grade drive-lesson-rating-grade--${g}${
                  grade === g ? " is-selected" : ""
                }`}
                aria-pressed={grade === g}
                disabled={busy}
                onClick={() => setGrade(g)}
              >
                {g}
              </button>
            ))}
          </div>
        )}
        {error ? (
          <p className="form-error drive-lesson-rating-err" role="alert">
            {error}
          </p>
        ) : null}
        <div className="confirm-dialog-actions drive-lesson-rating-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={
              busy ||
              (variant === "student" ? stars < 1 : grade !== 3 && grade !== 4 && grade !== 5)
            }
          >
            {busy ? "Сохранение…" : "Ок"}
          </button>
        </div>
      </div>
    </div>
  );
}
