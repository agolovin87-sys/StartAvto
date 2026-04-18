import { useCallback, useEffect, useMemo, useState } from "react";
import type { InternalExamSession, StudentExamView } from "@/types/internalExam";
import { getInternalExamSheet, subscribeStudentExamSessions } from "@/services/internalExamService";
import { exportExamSheetPDF, openExamSheetPreview } from "@/services/examExportService";

function sessionToViews(session: InternalExamSession, studentId: string): StudentExamView[] {
  const out: StudentExamView[] = [];
  for (const st of session.students) {
    if (st.studentId !== studentId) continue;
    out.push({
      id: `${session.id}_${st.studentId}`,
      examSessionId: session.id,
      studentId: st.studentId,
      studentName: st.studentName,
      instructorId: session.instructorId,
      instructorName: session.instructorName,
      examDate: session.examDate,
      examTime: session.examTime,
      status: st.status,
      totalPoints: st.totalPoints,
      examSheetId: st.examSheetId,
      completedAt: st.completedAt,
    });
  }
  return out;
}

/**
 * Экзамены курсанта: список и экспорт листа (подписка на Firestore — карточка появляется сразу после создания сессии).
 */
export function useStudentExam(studentId: string | undefined) {
  const [exams, setExams] = useState<StudentExamView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = studentId?.trim();
    if (!uid) {
      setExams([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeStudentExamSessions(
      uid,
      (sessions) => {
        const flat: StudentExamView[] = [];
        for (const s of sessions) flat.push(...sessionToViews(s, uid));
        flat.sort((a, b) => {
          const ca = a.completedAt ?? 0;
          const cb = b.completedAt ?? 0;
          return cb - ca;
        });
        setExams(flat);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [studentId]);

  const upcomingExams = useMemo(
    () => exams.filter((e) => e.status === "pending" || e.status === "in_progress"),
    [exams]
  );

  const activeExam = useMemo(() => {
    const prog = exams.find((e) => e.status === "in_progress");
    if (prog) return prog;
    return exams.find((e) => e.status === "pending") ?? null;
  }, [exams]);

  const completedExams = useMemo(
    () => exams.filter((e) => e.status === "passed" || e.status === "failed"),
    [exams]
  );

  const openExamPdf = useCallback(async (examSheetId: string) => {
    const sheet = await getInternalExamSheet(examSheetId);
    if (!sheet || sheet.isDraft) return;
    openExamSheetPreview(sheet);
  }, []);

  const downloadExamPdf = useCallback(async (examSheetId: string, filename: string) => {
    const sheet = await getInternalExamSheet(examSheetId);
    if (!sheet || sheet.isDraft) return;
    await exportExamSheetPDF(sheet, filename);
  }, []);

  /** Зарезервировано; список обновляется через подписку Firestore. */
  const fetchStudentExams = useCallback(() => Promise.resolve(), []);

  return {
    exams,
    loading,
    fetchStudentExams,
    upcomingExams,
    getActiveExam: () => activeExam,
    activeExam,
    getCompletedExams: () => completedExams,
    completedExams,
    openExamPdf,
    downloadExamPdf,
  };
}
