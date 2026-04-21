import { useAuth } from "@/context/AuthContext";
import { CabinetBackToDashboardButton } from "@/components/CabinetBackToDashboardButton";
import { StudentCabinetTalonBalance } from "@/components/student/StudentCabinetTalonBalance";
import { StudentCabinetDrivingProgress } from "@/components/student/StudentCabinetDrivingProgress";
import { StudentCabinetDrivingHistory } from "@/components/student/StudentCabinetDrivingHistory";
import { StudentCabinetExams } from "@/components/student/StudentCabinetExams";
import { StudentCabinetInternalDrivingBlock } from "@/components/student/StudentCabinetInternalDrivingBlock";

/**
 * Личный кабинет курсанта — отдельный маршрут `/app/student/cabinet` (без нижней навигации).
 */
export function StudentCabinet() {
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
            <CabinetBackToDashboardButton />
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

        <footer className="student-cabinet-footer-back">
          <CabinetBackToDashboardButton />
        </footer>
      </div>
    </div>
  );
}
