import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useStudentExam } from "@/hooks/useStudentExam";
import { useStudentCabinet } from "@/hooks/useStudentCabinet";
import { TicketBalance } from "@/components/student/TicketBalance";
import { ProgressSection } from "@/components/student/ProgressSection";
import { ErrorsStatistics } from "@/components/student/ErrorsStatistics";
import { RatingSection } from "@/components/student/RatingSection";
import { DrivingLessonsList } from "@/components/student/DrivingLessonsList";
import type { DrivingLesson } from "@/types/studentCabinet";

/**
 * Расширенный личный кабинет курсанта (отдельный маршрут, без нижней навигации).
 * Данные подтягиваются из слотов, журнала талонов и журнала ошибок урока — обновляются после каждого урока.
 */
export function StudentCabinet() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const studentId = (user?.uid ?? profile?.uid ?? "").trim();
  const displayName = profile?.displayName?.trim() ?? "Курсант";
  const talons = profile?.talons ?? 0;
  const drivesCount = profile?.drivesCount ?? 0;

  const { exams, openExamPdf } = useStudentExam(studentId || undefined);
  const { balance, progress, lessons, errors, rating, loading, err } = useStudentCabinet(
    studentId || undefined,
    talons,
    drivesCount,
    exams
  );

  const recentLessons = useMemo(() => lessons.slice(0, 3), [lessons]);

  function goDashboardTickets() {
    navigate("..", { state: { studentTab: "tickets" as const } });
  }

  function openTrackForSlot(slotId: string) {
    navigate("..", {
      state: { studentTab: "history" as const, focusDriveSlotId: slotId },
    });
  }

  async function openExamSheet(examSheetId: string) {
    await openExamPdf(examSheetId);
  }

  return (
    <div className="admin-dashboard student-cabinet-page">
      <div className="admin-dashboard-content student-cabinet-content">
        <header className="student-cabinet-header">
          <div>
            <h1 className="dashboard-title student-cabinet-title">Личный кабинет курсанта</h1>
            <p className="field-hint student-cabinet-hint">
              Баланс, прогресс и журнал уроков обновляются автоматически после каждого вождения.
            </p>
          </div>
          <div className="student-cabinet-header-actions">
            <span className="student-cabinet-user-name">{displayName}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("..")}>
              ← Назад
            </button>
          </div>
        </header>

        {loading ? (
          <p className="admin-empty" role="status">
            Загрузка данных…
          </p>
        ) : null}
        {err ? (
          <div className="form-error" role="alert">
            {err}
          </div>
        ) : null}

        <div className="student-cabinet-grid">
          <div className="student-cabinet-col student-cabinet-col--left">
            <TicketBalance balance={balance} onReplenish={goDashboardTickets} />
            <ErrorsStatistics errors={errors} lessons={lessons} lessonsCount={lessons.length} />
            <section className="student-cabinet-card" aria-labelledby="student-cabinet-recent-title">
              <h2 id="student-cabinet-recent-title" className="student-cabinet-card__title">
                Последние уроки
              </h2>
              {recentLessons.length === 0 ? (
                <p className="field-hint">Завершённых уроков пока нет.</p>
              ) : (
                <ul className="student-cabinet-recent-list">
                  {recentLessons.map((l: DrivingLesson) => (
                    <li key={l.id} className="student-cabinet-recent-item">
                      <span>{new Date(l.date).toLocaleDateString("ru-RU")}</span>
                      <span className="student-cabinet-recent-ins">{l.instructorName || "—"}</span>
                      <span>⭐ {l.rating.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="btn btn-ghost btn-sm student-cabinet-link-all" onClick={() => {
                const el = document.getElementById("student-cabinet-lessons-anchor");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}>
                Все уроки ↓
              </button>
            </section>
          </div>
          <div className="student-cabinet-col student-cabinet-col--right">
            <ProgressSection progress={progress} />
            <RatingSection rating={rating} />
          </div>
        </div>

        <div id="student-cabinet-lessons-anchor" className="student-cabinet-full-width">
          <DrivingLessonsList
            lessons={lessons}
            onOpenTrack={openTrackForSlot}
            onOpenExamPdf={(examSheetId) => void openExamSheet(examSheetId)}
          />
        </div>
      </div>
    </div>
  );
}
