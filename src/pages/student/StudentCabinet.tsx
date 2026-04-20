import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { StudentCabinetTalonBalance } from "@/components/student/StudentCabinetTalonBalance";
import { StudentCabinetDrivingProgress } from "@/components/student/StudentCabinetDrivingProgress";
import { StudentCabinetDrivingHistory } from "@/components/student/StudentCabinetDrivingHistory";
import { StudentCabinetExams } from "@/components/student/StudentCabinetExams";
import { StudentCabinetInternalDrivingBlock } from "@/components/student/StudentCabinetInternalDrivingBlock";

/**
 * Личный кабинет курсанта — отдельный маршрут `/app/student/cabinet` (без нижней навигации).
 */
export function StudentCabinet() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const displayName = profile?.displayName?.trim() ?? "Курсант";

  return (
    <div className="admin-dashboard student-cabinet-page">
      <div className="admin-dashboard-content student-cabinet-content">
        <header className="student-cabinet-header">
          <div>
            <h1 className="dashboard-title student-cabinet-title">Личный кабинет курсанта</h1>
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
          <StudentCabinetTalonBalance />
          <StudentCabinetDrivingProgress />
          <StudentCabinetDrivingHistory />
          <StudentCabinetExams />
          <StudentCabinetInternalDrivingBlock />
        </div>
      </div>
    </div>
  );
}
