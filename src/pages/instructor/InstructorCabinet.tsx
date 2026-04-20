import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { subscribeDriveSlotsForInstructor } from "@/firebase/drives";
import type { DriveSlot } from "@/types";

function IconTalonsCabinet() {
  return (
    <svg className="instructor-cabinet-block-ico" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-4h16v4zm0-6H4V6h16v6z"
      />
    </svg>
  );
}

function IconStarCabinet() {
  return (
    <svg className="instructor-cabinet-block-ico" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
      />
    </svg>
  );
}

function IconCarCabinet() {
  return (
    <svg className="instructor-cabinet-block-ico" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"
      />
    </svg>
  );
}

/**
 * Личный кабинет инструктора — `/app/instructor/cabinet`.
 */
export function InstructorCabinet() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const uid = profile?.uid?.trim() ?? "";
  const displayName = profile?.displayName?.trim() ?? "Инструктор";
  const talons = profile?.talons ?? 0;
  const vehicle = profile?.vehicleLabel?.trim() || "—";
  const zeroTalons = talons === 0;

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

  const roundedStars = ratingStats.average != null ? Math.min(5, Math.max(1, Math.round(ratingStats.average))) : 0;

  return (
    <div className="admin-dashboard student-cabinet-page instructor-cabinet-page">
      <div className="admin-dashboard-content student-cabinet-content">
        <header className="student-cabinet-header">
          <div>
            <h1 className="dashboard-title student-cabinet-title">Личный кабинет инструктора</h1>
          </div>
          <div className="student-cabinet-header-actions">
            <button
              type="button"
              className="student-cab-back-ico-btn"
              onClick={() => navigate("..")}
              aria-label="Назад к главной"
              title="Назад"
            >
              <svg className="student-cab-back-ico" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
                />
              </svg>
            </button>
            <span className="student-cabinet-user-name">{displayName}</span>
          </div>
        </header>

        <div className="student-cabinet-blocks">
          <section className="student-cabinet-card instructor-cabinet-card" aria-labelledby="instr-cab-talon-title">
            <h2 id="instr-cab-talon-title" className="instructor-cabinet-card__head">
              <IconTalonsCabinet />
              <span>Баланс талонов</span>
            </h2>
            <div className="instructor-cabinet-talon-row">
              <span className="field-hint instructor-cabinet-hint">
                Талоны начисляются и списываются при завершённых вождениях по правилам автошколы.
              </span>
              <span
                className={
                  zeroTalons
                    ? "instructor-cabinet-talon-disc is-zero"
                    : "instructor-cabinet-talon-disc is-positive"
                }
                aria-label={`Баланс: ${talons}`}
              >
                {talons}
              </span>
            </div>
          </section>

          <section className="student-cabinet-card instructor-cabinet-card" aria-labelledby="instr-cab-rating-title">
            <h2 id="instr-cab-rating-title" className="instructor-cabinet-card__head">
              <IconStarCabinet />
              <span>Рейтинг</span>
            </h2>
            <p className="field-hint instructor-cabinet-hint">
              Средняя оценка от курсантов после завершённых вождений (звёзды 1–5 при закрытии урока).
            </p>
            {ratingStats.count === 0 ? (
              <p className="admin-settings-section-desc" role="status">
                Пока нет оценок: после вождения курсант может поставить звёзды инструктору.
              </p>
            ) : (
              <>
                <div className="instructor-cabinet-rating-stars" aria-hidden>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className={
                        n <= roundedStars
                          ? "instructor-cabinet-star instructor-cabinet-star--on"
                          : "instructor-cabinet-star"
                      }
                    >
                      ★
                    </span>
                  ))}
                </div>
                <p className="instructor-cabinet-rating-value">
                  <strong>{ratingStats.average?.toFixed(1)}</strong> из 5 · оценок: {ratingStats.count}
                </p>
              </>
            )}
          </section>

          <section className="student-cabinet-card instructor-cabinet-card" aria-labelledby="instr-cab-car-title">
            <h2 id="instr-cab-car-title" className="instructor-cabinet-card__head">
              <IconCarCabinet />
              <span>Учебный автомобиль</span>
            </h2>
            <p className="instructor-cabinet-vehicle-value">{vehicle}</p>
            <p className="field-hint instructor-cabinet-hint">
              Обозначение задаётся в настройках профиля (администратор или вы, если доступно).
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
