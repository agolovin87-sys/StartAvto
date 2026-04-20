import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useStudentExam } from "@/hooks/useStudentExam";
import type { AdminScheduledExam } from "@/types/scheduledExam";
import { ADMIN_SCHEDULED_EXAM_TYPE_LABEL } from "@/types/scheduledExam";
import { subscribeAdminScheduledExamsByGroup } from "@/services/scheduledExamService";
import type { StudentExamView } from "@/types/internalExam";

const PLACEHOLDER = "Дата не установлена…";

function formatRuDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function drivingExamLine(exams: StudentExamView[]): string {
  const pending = exams.filter((e) => e.status === "pending" || e.status === "in_progress");
  const sortKey = (e: StudentExamView) => `${e.examDate}T${e.examTime}:00`;
  const sorted = [...pending].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const pick = sorted[0];
  if (pick) {
    return `${formatRuDate(pick.examDate)} · ${pick.examTime}`;
  }
  const done = exams.filter((e) => e.status === "passed" || e.status === "failed");
  if (done.length > 0) {
    const last = [...done].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0];
    if (last) {
      return `${formatRuDate(last.examDate)} · ${last.examTime} (завершён)`;
    }
  }
  return PLACEHOLDER;
}

function latestByType(rows: AdminScheduledExam[], type: AdminScheduledExam["examType"]): AdminScheduledExam | null {
  const f = rows.filter((r) => r.examType === type);
  if (f.length === 0) return null;
  return f.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
}

/**
 * Экзамены в ЛК: теория и ГИБДД (админ), вождение (сессия инструктора) — только просмотр.
 */
export function StudentCabinetExams() {
  const { profile } = useAuth();
  const studentId = profile?.uid;
  const groupId = profile?.groupId?.trim() ?? "";

  const { exams: driveExams, loading: driveLoading } = useStudentExam(studentId);

  const [adminRows, setAdminRows] = useState<AdminScheduledExam[]>([]);
  const [adminLoading, setAdminLoading] = useState(true);

  useEffect(() => {
    if (!groupId) {
      setAdminRows([]);
      setAdminLoading(false);
      return;
    }
    setAdminLoading(true);
    const unsub = subscribeAdminScheduledExamsByGroup(
      groupId,
      (list) => {
        setAdminRows(list);
        setAdminLoading(false);
      },
      () => setAdminLoading(false)
    );
    return () => unsub();
  }, [groupId]);

  const theory = useMemo(() => latestByType(adminRows, "internal_theory"), [adminRows]);
  const gibdd = useMemo(() => latestByType(adminRows, "gibdd_reo"), [adminRows]);

  const theoryLine = theory
    ? `${formatRuDate(theory.examDate)} · ${theory.examTime}`
    : PLACEHOLDER;
  const gibddLine = gibdd ? `${formatRuDate(gibdd.examDate)} · ${gibdd.examTime}` : PLACEHOLDER;

  const driveLine = useMemo(() => drivingExamLine(driveExams), [driveExams]);

  const loading = adminLoading || driveLoading;

  return (
    <section className="student-cabinet-card student-cab-exams-card" aria-labelledby="cabinet-exams-title">
      <h2 id="cabinet-exams-title" className="student-cabinet-talon-head-title">
        Экзамены
      </h2>
      {loading ? (
        <p className="student-cab-exams-hint">Загрузка…</p>
      ) : (
        <ul className="student-cab-exams-list">
          <li className="student-cab-exams-row">
            <span className="student-cab-exams-kind">{ADMIN_SCHEDULED_EXAM_TYPE_LABEL.internal_theory}</span>
            <span className="student-cab-exams-value">{theoryLine}</span>
          </li>
          <li className="student-cab-exams-row">
            <span className="student-cab-exams-kind">Внутренний экзамен — Вождение</span>
            <span className="student-cab-exams-value">{driveLine}</span>
          </li>
          <li className="student-cab-exams-row">
            <span className="student-cab-exams-kind">{ADMIN_SCHEDULED_EXAM_TYPE_LABEL.gibdd_reo}</span>
            <span className="student-cab-exams-value">{gibddLine}</span>
          </li>
        </ul>
      )}
      <p className="student-cab-exams-footnote">
        Даты теории и экзамена в ГИБДД задаёт администратор. Внутренний экзамен по вождению назначает инструктор
        во вкладке «Запись».
      </p>
    </section>
  );
}
