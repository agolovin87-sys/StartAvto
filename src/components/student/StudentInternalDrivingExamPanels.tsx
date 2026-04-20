import { useState } from "react";
import { ExamCard } from "@/components/student/ExamCard";
import { useAuth } from "@/context/AuthContext";
import { useStudentExam } from "@/hooks/useStudentExam";

type Props = {
  /** В личном кабинете — без верхнего отступа секции вкладки */
  embedded?: boolean;
};

/**
 * Предстоящие и завершённые внутренние экзамены по вождению (как на вкладке «Экзамен»).
 */
export function StudentInternalDrivingExamPanels({ embedded = false }: Props) {
  const { user } = useAuth();
  const studentId = user?.uid ?? "";
  const { loading, upcomingExams, completedExams, downloadExamPdf } = useStudentExam(studentId);
  const [completedCollapsed, setCompletedCollapsed] = useState(true);

  return (
    <div className={embedded ? "student-cab-internal-driving-panels" : undefined}>
      {loading ? (
        <p className="admin-settings-section-desc">Загрузка…</p>
      ) : (
        <>
          {upcomingExams.length > 0 ? (
            <section className="student-exam-tab__section" aria-label="Предстоящие экзамены">
              <ul className="student-exam-tab__list">
                {upcomingExams.map((ex) => (
                  <li key={ex.id}>
                    <ExamCard exam={ex} onDownload={() => {}} />
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="admin-settings-section-desc">Нет запланированных внутренних экзаменов.</p>
          )}
          {completedExams.length > 0 ? (
            <section className="student-exam-tab__section" aria-label="Завершённые экзамены">
              <div className="instructor-internal-exam__done-head">
                <button
                  type="button"
                  className="instructor-home-section-toggle instructor-internal-exam__done-toggle"
                  aria-expanded={!completedCollapsed}
                  onClick={() => setCompletedCollapsed((c) => !c)}
                >
                  <span className="instructor-home-section-toggle-label">Завершённые</span>
                  <span className="instructor-home-section-toggle-meta">{completedExams.length}</span>
                </button>
              </div>
              {!completedCollapsed ? (
                <ul className="student-exam-tab__list">
                  {completedExams.map((ex) => (
                    <li key={ex.id}>
                      <ExamCard
                        exam={ex}
                        onDownload={() => {
                          if (ex.examSheetId) {
                            void downloadExamPdf(
                              ex.examSheetId,
                              `Экзамен_${ex.studentName}_${ex.examDate}`
                            );
                          }
                        }}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
