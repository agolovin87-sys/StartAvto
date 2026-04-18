import { useCallback, useEffect, useState } from "react";
import type { InternalExamSession, InternalExamSheet, InternalExamStudent } from "@/types/internalExam";
import {
  completeStudentExam as completeStudentExamApi,
  createInternalExamSession,
  getInternalExamSession,
  type CreateSessionInput,
  type CompleteExamInput,
  saveExamSheetDraft as saveExamSheetDraftApi,
  startStudentExam as startStudentExamApi,
  subscribeInstructorExamSessions,
} from "@/services/internalExamService";

/**
 * Экзамены инструктора: список сессий и операции с листом.
 */
export function useInternalExam(instructorId: string | undefined) {
  const [sessions, setSessions] = useState<InternalExamSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = instructorId?.trim();
    if (!uid) {
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeInstructorExamSessions(
      uid,
      (list) => {
        setSessions(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [instructorId]);

  const createExamSession = useCallback(async (data: CreateSessionInput) => {
    return createInternalExamSession(data);
  }, []);

  const getExamSession = useCallback(async (sessionId: string) => {
    return getInternalExamSession(sessionId);
  }, []);

  const startStudentExamFn = useCallback(async (sessionId: string, studentId: string) => {
    return startStudentExamApi(sessionId, studentId);
  }, []);

  const completeStudentExamFn = useCallback(
    async (sessionId: string, studentId: string, sheet: CompleteExamInput) => {
      await completeStudentExamApi(sessionId, studentId, sheet);
    },
    []
  );

  const getExamStudentsBySession = useCallback((sessionId: string): InternalExamStudent[] => {
    const s = sessions.find((x) => x.id === sessionId);
    return s?.students ?? [];
  }, [sessions]);

  const saveExamDraft = useCallback(
    async (sheetId: string, data: Pick<InternalExamSheet, "exercises" | "errors" | "examinerComment">) => {
      await saveExamSheetDraftApi(sheetId, data);
    },
    []
  );

  return {
    sessions,
    loading,
    createExamSession,
    getExamSession,
    startStudentExam: startStudentExamFn,
    completeStudentExam: completeStudentExamFn,
    getExamStudentsBySession,
    saveExamDraft,
  };
}
