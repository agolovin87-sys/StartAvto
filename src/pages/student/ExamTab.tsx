import { StudentInternalDrivingExamPanels } from "@/components/student/StudentInternalDrivingExamPanels";

/**
 * Вкладка «Экзамен»: внутренние экзамены курсанта (тот же контент, что в личном кабинете).
 */
export function ExamTab() {
  return (
    <div className="admin-tab student-exam-tab">
      <h1 className="admin-tab-title">Экзамен</h1>
      <StudentInternalDrivingExamPanels />
    </div>
  );
}
