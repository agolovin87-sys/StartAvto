import { useEffect, useMemo, useState } from "react";
import { subscribeDriveSlotsForInstructor } from "@/firebase/drives";
import { useAuth } from "@/context/AuthContext";
import type { DriveSlot } from "@/types";
import { IconInstructorCabinetRating } from "@/components/instructor/instructorCabinetSectionIcons";

/**
 * Рейтинг инструктора по оценкам курсантов после завершённых вождений (1–5).
 */
export function InstructorCabinetRatingSection() {
  const { profile } = useAuth();
  const uid = profile?.uid?.trim() ?? "";
  const [slots, setSlots] = useState<DriveSlot[]>([]);

  useEffect(() => {
    if (!uid) {
      setSlots([]);
      return;
    }
    return subscribeDriveSlotsForInstructor(uid, setSlots, () => setSlots([]));
  }, [uid]);

  const ratingStats = useMemo(() => {
    const rated = slots.filter(
      (s) =>
        s.status === "completed" &&
        s.studentRatingInstructor != null &&
        typeof s.studentRatingInstructor === "number" &&
        s.studentRatingInstructor >= 1 &&
        s.studentRatingInstructor <= 5
    );
    if (rated.length === 0) {
      return { count: 0, average: null as number | null };
    }
    const sum = rated.reduce((a, s) => a + (s.studentRatingInstructor ?? 0), 0);
    return { count: rated.length, average: Math.round((sum / rated.length) * 10) / 10 };
  }, [slots]);

  const avgLabel =
    ratingStats.average != null ? ratingStats.average.toFixed(1).replace(".", ",") : "";

  return (
    <section
      className="student-cabinet-card instructor-cabinet-block-surface instructor-cabinet-rating-section"
      aria-labelledby="instructor-cabinet-rating-title"
    >
      <h2
        id="instructor-cabinet-rating-title"
        className="student-cabinet-talon-head-title student-cab-title-with-ico instructor-cabinet-block-heading"
      >
        <IconInstructorCabinetRating className="instructor-cab-section-ico" />
        <span>Рейтинг</span>
      </h2>
      <p className="field-hint instructor-cabinet-block-lead instructor-cabinet-rating-lead">
        Средняя оценка от курсантов после завершённых вождений (звёзды 1–5 при закрытии урока).
      </p>
      {ratingStats.count === 0 ? (
        <p className="admin-settings-section-desc" role="status">
          Пока нет оценок: после вождения курсант может поставить звёзды инструктору.
        </p>
      ) : (
        <div className="instructor-cabinet-rating-row">
          <div
            className="instructor-cabinet-rating-badge"
            role="img"
            aria-label={`Средняя оценка ${ratingStats.average?.toFixed(1).replace(".", ",")} из пяти, оценок ${ratingStats.count}`}
          >
            <span className="instructor-cabinet-rating-badge-star" aria-hidden>
              ★
            </span>
            <span className="instructor-cabinet-rating-badge-value">{avgLabel}</span>
          </div>
          <p className="instructor-cabinet-rating-value">
            из 5 · оценок: {ratingStats.count}
          </p>
        </div>
      )}
    </section>
  );
}
