import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { StudentCabinetTalonBalance } from "@/components/student/StudentCabinetTalonBalance";
import { StudentCabinetDrivingProgress } from "@/components/student/StudentCabinetDrivingProgress";

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
            <span className="student-cabinet-user-name">{displayName}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("..")}>
              ← Назад
            </button>
          </div>
        </header>

        <div className="student-cabinet-blocks">
          <StudentCabinetTalonBalance />
          <StudentCabinetDrivingProgress />
        </div>
      </div>
    </div>
  );
}
