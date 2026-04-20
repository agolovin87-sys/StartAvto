import { IconCabinetDrivingExam } from "@/components/student/studentCabinetSectionIcons";
import { StudentInternalDrivingExamPanels } from "@/components/student/StudentInternalDrivingExamPanels";

/**
 * Детали внутреннего экзамена по вождению (карточки) — под сводкой в блоке «Экзамены».
 */
export function StudentCabinetInternalDrivingBlock() {
  return (
    <section
      className="student-cabinet-card student-cab-internal-drive-exams"
      aria-labelledby="cabinet-internal-drive-exams-title"
    >
      <h2
        id="cabinet-internal-drive-exams-title"
        className="student-cabinet-talon-head-title student-cab-title-with-ico"
      >
        <IconCabinetDrivingExam />
        <span>Внутренний экзамен — вождение</span>
      </h2>
      <StudentInternalDrivingExamPanels embedded />
    </section>
  );
}
