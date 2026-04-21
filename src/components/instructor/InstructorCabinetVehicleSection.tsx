import { useAuth } from "@/context/AuthContext";
import { IconInstructorCabinetVehicle } from "@/components/instructor/instructorCabinetSectionIcons";
import { useCars } from "@/hooks/useCars";

/**
 * Учебный автомобиль инструктора (из профиля).
 */
export function InstructorCabinetVehicleSection() {
  const { user, profile } = useAuth();
  const { cars } = useCars();
  const uid = (user?.uid ?? profile?.uid ?? "").trim();
  const vehicle = profile?.vehicleLabel?.trim() || "—";
  const assignedCar = cars.find((c) => c.instructorId === uid && !c.deleted);
  const kmLeft =
    assignedCar?.nextServiceDueMileage != null
      ? assignedCar.nextServiceDueMileage - assignedCar.mileage
      : null;
  const nearService = kmLeft != null && kmLeft >= 0 && kmLeft <= 50;

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
      {nearService ? (
        <p className="instructor-cabinet-vehicle-alert" role="status">
          Внимание: до следующего ТО осталось {kmLeft?.toLocaleString("ru-RU")} км.
          Сообщите администратору и запланируйте замену.
        </p>
      ) : null}
    </section>
  );
}
