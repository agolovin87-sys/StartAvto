import { ExamCard } from "@/components/student/ExamCard";
import { useAuth } from "@/context/AuthContext";
import { useStudentExam } from "@/hooks/useStudentExam";

/**
 * Вкладка «Экзамен»: внутренние экзамены курсанта.
 */
export function ExamTab() {
  const { user } = useAuth();
  const studentId = user?.uid ?? "";
  const { loading, activeExam, completedExams, openExamPdf, downloadExamPdf } =
    useStudentExam(studentId);

  return (
    <div className="admin-tab student-exam-tab">
      <h1 className="admin-tab-title">Экзамен</h1>
      {loading ? (
        <p className="admin-settings-section-desc">Загрузка…</p>
      ) : (
        <>
          {activeExam ? (
            <section className="student-exam-tab__section" aria-label="Предстоящий экзамен">
              <ExamCard
                exam={activeExam}
                onOpen={() => {}}
                onDownload={() => {}}
              />
            </section>
          ) : (
            <p className="admin-settings-section-desc">Нет запланированных внутренних экзаменов.</p>
          )}
          {completedExams.length > 0 ? (
            <section className="student-exam-tab__section" aria-label="Завершённые экзамены">
              <h2 className="instructor-subtitle">Завершённые</h2>
              <ul className="student-exam-tab__list">
                {completedExams.map((ex) => (
                  <li key={ex.id}>
                    <ExamCard
                      exam={ex}
                      onOpen={() => {
                        if (ex.examSheetId) void openExamPdf(ex.examSheetId);
                      }}
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
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
