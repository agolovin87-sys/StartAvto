import type { StudentRating } from "@/types/studentCabinet";

type RatingSectionProps = {
  rating: StudentRating;
};

function fmtLessonShort(lesson: NonNullable<StudentRating["bestLesson"]>): string {
  return `${lesson.rating.toFixed(1)} (${new Date(lesson.date).toLocaleDateString("ru-RU")}, ${lesson.instructorName})`;
}

/** Средняя оценка, лучший/худший урок, динамика. */
export function RatingSection({ rating }: RatingSectionProps) {
  if (rating.totalLessons === 0) {
    return (
      <section className="student-cabinet-card" aria-labelledby="student-cabinet-rating-title">
        <h2 id="student-cabinet-rating-title" className="student-cabinet-card__title">
          Рейтинг и динамика
        </h2>
        <p className="field-hint">Пока нет завершённых уроков для расчёта оценки.</p>
      </section>
    );
  }

  return (
    <section className="student-cabinet-card" aria-labelledby="student-cabinet-rating-title">
      <h2 id="student-cabinet-rating-title" className="student-cabinet-card__title">
        Рейтинг и динамика
      </h2>
      <p className="student-cabinet-tickets-big">
        Средняя оценка: <strong>{rating.averageRating.toFixed(1)}</strong> ⭐
      </p>
      {rating.bestLesson ? (
        <p className="student-cabinet-tickets-sub">
          Лучший урок: {fmtLessonShort(rating.bestLesson)}
        </p>
      ) : null}
      {rating.worstLesson ? (
        <p className="student-cabinet-tickets-sub">
          Худший урок: {fmtLessonShort(rating.worstLesson)}
        </p>
      ) : null}
      <p className="student-cabinet-tickets-sub">
        Динамика (последние 5 vs предыдущие 5):{" "}
        {rating.improvement >= 0 ? (
          <span className="student-cabinet-up">📈 +{rating.improvement}%</span>
        ) : (
          <span className="student-cabinet-down">📉 {rating.improvement}%</span>
        )}
      </p>
      {rating.groupPercentileRank != null ? (
        <p className="field-hint">
          Вы опережаете {rating.groupPercentileRank}% курсантов группы по средней оценке.
        </p>
      ) : null}
    </section>
  );
}
