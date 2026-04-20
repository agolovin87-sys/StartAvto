import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { InstructorCabinetRatingSection } from "@/components/instructor/InstructorCabinetRatingSection";
import { InstructorCabinetTalonSection } from "@/components/instructor/InstructorCabinetTalonSection";
import { InstructorCabinetVehicleSection } from "@/components/instructor/InstructorCabinetVehicleSection";

/**
 * Личный кабинет инструктора — структура как у курсанта (`/app/instructor/cabinet`).
 */
export function InstructorCabinet() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const displayName = profile?.displayName?.trim() ?? "Инструктор";

  return (
    <div className="admin-dashboard student-cabinet-page instructor-cabinet-page">
      <div className="admin-dashboard-content student-cabinet-content">
        <header className="student-cabinet-header">
          <div>
            <h1 className="dashboard-title student-cabinet-title">Личный кабинет инструктора</h1>
            <p className="student-cabinet-hint instructor-cabinet-page-lead">
              Баланс талонов, оценки от курсантов и учебное ТС — в одном месте.
            </p>
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

        <div className="student-cabinet-blocks instructor-cabinet-blocks">
          <InstructorCabinetTalonSection />
          <InstructorCabinetRatingSection />
          <InstructorCabinetVehicleSection />
        </div>
      </div>
    </div>
  );
}
