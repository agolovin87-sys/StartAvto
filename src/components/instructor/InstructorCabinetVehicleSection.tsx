import { useAuth } from "@/context/AuthContext";
import { IconInstructorCabinetVehicle } from "@/components/instructor/instructorCabinetSectionIcons";

/**
 * Учебный автомобиль инструктора (из профиля).
 */
export function InstructorCabinetVehicleSection() {
  const { profile } = useAuth();
  const vehicle = profile?.vehicleLabel?.trim() || "—";

  return (
    <section
      className="student-cabinet-card instructor-cabinet-block-surface instructor-cabinet-vehicle-section"
      aria-labelledby="instructor-cabinet-vehicle-title"
    >
      <h2
        id="instructor-cabinet-vehicle-title"
        className="student-cabinet-talon-head-title student-cab-title-with-ico instructor-cabinet-block-heading"
      >
        <IconInstructorCabinetVehicle className="instructor-cab-section-ico" />
        <span>Учебный автомобиль</span>
      </h2>
      <p className="instructor-cabinet-vehicle-value">{vehicle}</p>
      <p className="field-hint instructor-cabinet-block-lead">
        Обозначение задаётся в настройках профиля (администратор или вы, если доступно).
      </p>
    </section>
  );
}
