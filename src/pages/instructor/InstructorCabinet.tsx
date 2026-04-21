import { useAuth } from "@/context/AuthContext";
import { CabinetBackToDashboardButton } from "@/components/CabinetBackToDashboardButton";
import { InstructorCabinetRatingSection } from "@/components/instructor/InstructorCabinetRatingSection";
import { InstructorCabinetWorkloadSection } from "@/components/instructor/InstructorCabinetWorkloadSection";
import { InstructorCabinetTalonSection } from "@/components/instructor/InstructorCabinetTalonSection";
import { InstructorCabinetVehicleSection } from "@/components/instructor/InstructorCabinetVehicleSection";

/**
 * Личный кабинет инструктора — структура как у курсанта (`/app/instructor/cabinet`).
 */
export function InstructorCabinet() {
  const { profile } = useAuth();
  const displayName = profile?.displayName?.trim() ?? "Инструктор";

  return (
    <div className="admin-dashboard student-cabinet-page instructor-cabinet-page">
      <div className="admin-dashboard-content student-cabinet-content">
        <header className="student-cabinet-header">
          <div>
            <h1 className="dashboard-title student-cabinet-title">Личный кабинет инструктора</h1>
          </div>
          <div className="student-cabinet-header-actions">
            <CabinetBackToDashboardButton />
            <span className="student-cabinet-user-name">{displayName}</span>
          </div>
        </header>

        <div className="student-cabinet-blocks instructor-cabinet-blocks">
          <InstructorCabinetTalonSection />
          <InstructorCabinetRatingSection />
          <InstructorCabinetWorkloadSection />
          <InstructorCabinetVehicleSection />
        </div>

        <footer className="student-cabinet-footer-back">
          <CabinetBackToDashboardButton />
        </footer>
      </div>
    </div>
  );
}
