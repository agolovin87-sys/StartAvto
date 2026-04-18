import { useCallback, useEffect, useState } from "react";
import type { InternalExamSession, InternalExamSheet } from "@/types/internalExam";
import type { TrainingGroup } from "@/types";
import { subscribeTrainingGroups } from "@/firebase/admin";
import {
  archiveAdminExamSessionsForGroup,
  dismissAdminArchiveSession,
  fetchAllAdminArchivedSessions,
  fetchExamSessionsByGroup,
  fetchExamSheetsForSessionIds,
  getInternalExamSheet,
} from "@/services/internalExamService";
import {
  batchExportToZip,
  exportExamSheetPDF,
  exportExamSheetWord,
  exportSummaryExcel,
} from "@/services/examExportService";

/**
 * Внутренний экзамен в админке: группы, сессии, листы, экспорт.
 */
export function useAdminExam() {
  const [groups, setGroups] = useState<TrainingGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);

  useEffect(() => {
    return subscribeTrainingGroups(
      (g) => {
        setGroups(g);
        setGroupsLoading(false);
      },
      () => setGroupsLoading(false)
    );
  }, []);

  const getExamSessionsByGroup = useCallback(async (groupId: string) => {
    return fetchExamSessionsByGroup(groupId);
  }, []);

  const getExamSheetsByGroup = useCallback(async (groupId: string): Promise<InternalExamSheet[]> => {
    const sessions = await fetchExamSessionsByGroup(groupId);
    const ids = sessions.map((s) => s.id);
    return fetchExamSheetsForSessionIds(ids);
  }, []);

  const exportExamSheetWordFn = useCallback((examSheetId: string, filename: string) => {
    void (async () => {
      const sheet = await getInternalExamSheet(examSheetId);
      if (!sheet) return;
      exportExamSheetWord(sheet, filename);
    })();
  }, []);

  const exportExamSheetPDFFn = useCallback((examSheetId: string, filename: string) => {
    void (async () => {
      const sheet = await getInternalExamSheet(examSheetId);
      if (!sheet) return;
      await exportExamSheetPDF(sheet, filename);
    })();
  }, []);

  const batchExportToZipFn = useCallback(
    async (sheets: InternalExamSheet[], zipName: string) => {
      const items = sheets.map((sh) => ({
        sheet: sh,
        baseName: `Экзамен_${sh.studentName}_${sh.examDate}`.replace(/\s+/g, "_"),
      }));
      await batchExportToZip(items, zipName);
    },
    []
  );

  const exportSummaryVedomost = useCallback(
    (
      rows: {
        groupName: string;
        studentName: string;
        examDate: string;
        examTime: string;
        totalPoints: number | string;
        result: string;
      }[],
      filename: string
    ) => {
      exportSummaryExcel(rows, filename);
    },
    []
  );

  const archiveAllSessionsForGroup = useCallback(async (groupId: string) => {
    await archiveAdminExamSessionsForGroup(groupId);
  }, []);

  const dismissAdminArchive = useCallback(async (sessionId: string) => {
    await dismissAdminArchiveSession(sessionId);
  }, []);

  /** Архив админа по всем группам + листы для этих сессий. */
  const loadAdminArchiveGlobal = useCallback(async (): Promise<{
    sessions: InternalExamSession[];
    sheets: InternalExamSheet[];
  }> => {
    const sess = await fetchAllAdminArchivedSessions();
    const ids = sess.map((s) => s.id);
    const sheets = await fetchExamSheetsForSessionIds(ids);
    return { sessions: sess, sheets };
  }, []);

  return {
    groups,
    groupsLoading,
    getExamSessionsByGroup,
    getExamSheetsByGroup,
    exportExamSheetWord: exportExamSheetWordFn,
    exportExamSheetPDF: exportExamSheetPDFFn,
    batchExportToZip: batchExportToZipFn,
    exportSummaryVedomost,
    archiveAllSessionsForGroup,
    dismissAdminArchive,
    loadAdminArchiveGlobal,
  };
}
