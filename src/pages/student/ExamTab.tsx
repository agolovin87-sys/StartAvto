import { useState } from "react";
import { ExamCard } from "@/components/student/ExamCard";
import { useAuth } from "@/context/AuthContext";
import { useStudentExam } from "@/hooks/useStudentExam";

/**
 * Вкладка «Экзамен»: внутренние экзамены курсанта.
 */
export function ExamTab() {
  const { user } = useAuth();
  const studentId = user?.uid ?? "";
  const { loading, upcomingExams, completedExams, downloadExamPdf } = useStudentExam(studentId);
  /** true = блок «Завершённые» свёрнут (по умолчанию) */
  const [completedCollapsed, setCompletedCollapsed] = useState(true);

  return (
    <div className="admin-tab student-exam-tab">
      <h1 className="admin-tab-title">Экзамен</h1>
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
