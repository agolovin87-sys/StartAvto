import { useCallback, useEffect, useMemo, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import { useAdminExam } from "@/hooks/useAdminExam";
import type { InternalExamSession, InternalExamSheet } from "@/types/internalExam";
import { getInternalExamSheet } from "@/services/internalExamService";
import { exportExamSheetPDF as exportExamSheetPdfFromSheet } from "@/services/examExportService";

function statusRu(s: InternalExamSession["students"][0]): { label: string; cls: string } {
  if (s.status === "pending") return { label: "Не начат", cls: "admin-internal-exam-status--pending" };
  if (s.status === "in_progress")
    return { label: "Идёт", cls: "admin-internal-exam-status--progress" };
  if (s.status === "passed") return { label: "Сдан", cls: "admin-internal-exam-status--pass" };
  return { label: "Не сдан", cls: "admin-internal-exam-status--fail" };
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      className="admin-internal-exam-chevron"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden
      style={{ transform: open ? "rotate(180deg)" : undefined }}
    >
      <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
    </svg>
  );
}

/**
 * Раздел «Внутренний экзамен» на вкладке «График» администратора (по умолчанию свёрнут).
 */
export function AdminInternalExamSection() {
  const {
    groups,
    groupsLoading,
    getExamSessionsByGroup,
    getExamSheetsByGroup,
    exportExamSheetWord,
    batchExportToZip,
    exportSummaryVedomost,
  } = useAdminExam();

  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [sessions, setSessions] = useState<InternalExamSession[]>([]);
  const [sheets, setSheets] = useState<InternalExamSheet[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const groupName = useMemo(
    () => groups.find((g) => g.id === groupId)?.name ?? "",
    [groups, groupId]
  );

  const reload = useCallback(async () => {
    if (!groupId.trim()) {
      setSessions([]);
      setSheets([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const sess = await getExamSessionsByGroup(groupId.trim());
      setSessions(sess);
      const sh = await getExamSheetsByGroup(groupId.trim());
      setSheets(sh);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [groupId, getExamSessionsByGroup, getExamSheetsByGroup]);

  useEffect(() => {
    if (open && groupId) void reload();
  }, [open, groupId, reload]);

  const rowsFlat = useMemo(() => {
    const out: {
      session: InternalExamSession;
      student: InternalExamSession["students"][0];
      sheet?: InternalExamSheet;
    }[] = [];
    for (const session of sessions) {
      for (const st of session.students) {
        const sheet = sheets.find(
          (sh) => sh.examSessionId === session.id && sh.studentId === st.studentId
        );
        out.push({ session, student: st, sheet });
      }
    }
    return out;
  }, [sessions, sheets]);

  function exportOne(sheetId: string, base: string) {
    void (async () => {
      const sh = await getInternalExamSheet(sheetId);
      if (!sh || sh.isDraft) return;
      await exportExamSheetPdfFromSheet(sh, base);
    })();
  }

  function exportWordOne(sheetId: string, base: string) {
    exportExamSheetWord(sheetId, base);
  }

  async function zipAll() {
    const done = sheets.filter((s) => !s.isDraft);
    if (done.length === 0) return;
    await batchExportToZip(done, `Экзамены_${groupName || groupId}`);
  }

  function summaryExcel() {
    const rows = rowsFlat
      .filter((r) => r.student.status === "passed" || r.student.status === "failed")
      .map((r) => ({
        groupName: r.session.groupName,
        studentName: r.student.studentName,
        examDate: r.session.examDate,
        examTime: r.session.examTime,
        totalPoints: r.sheet?.totalPoints ?? r.student.totalPoints ?? "—",
        result:
          r.student.status === "passed"
            ? "СДАЛ"
            : r.student.status === "failed"
              ? "НЕ СДАЛ"
              : "—",
      }));
    exportSummaryVedomost(rows, `Ведомость_${groupName || "группа"}`);
  }

  const panelId = "admin-internal-exam-panel";

  return (
    <section className="admin-internal-exam-section">
      <button
        type="button"
        id="admin-internal-exam-toggle"
        className="instructor-home-section-toggle admin-internal-exam-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="instructor-home-section-toggle-label">Внутренний экзамен</span>
        <IconChevron open={open} />
      </button>
      <div id={panelId} className="admin-history-collapse-panel" hidden={!open}>
        {groupsLoading ? (
          <p className="admin-settings-section-desc">Загрузка групп…</p>
        ) : (
          <>
            <label className="field admin-internal-exam-field">
              <span className="field-label">Учебная группа</span>
              <select
                className="input"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="">— Выберите группу —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            {err ? (
              <p className="form-error" role="alert">
                {err}
              </p>
            ) : null}
            {loading ? (
              <p className="admin-settings-section-desc">Загрузка экзаменов…</p>
            ) : groupId ? (
              <>
                <div className="admin-internal-exam-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void reload()}>
                    Обновить
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={sheets.filter((s) => !s.isDraft).length === 0}
                    onClick={() => void zipAll()}
                  >
                    Экспорт всех листов (ZIP)
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={summaryExcel}>
                    Экспорт сводной ведомости (Excel)
                  </button>
                </div>
                <div className="admin-schedule-table-wrap admin-internal-exam-table-wrap">
                  <table className="admin-schedule-table">
                    <thead>
                      <tr>
                        <th>ФИО</th>
                        <th>Статус</th>
                        <th>Дата / время</th>
                        <th>Баллы</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowsFlat.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="admin-schedule-table-empty">
                            Нет данных по выбранной группе.
                          </td>
                        </tr>
                      ) : (
                        rowsFlat.map(({ session, student, sheet }) => {
                          const st = statusRu(student);
                          const done = student.status === "passed" || student.status === "failed";
                          const sid = student.examSheetId;
                          const base = `Экзамен_${student.studentName}_${session.examDate}`.replace(
                            /\s+/g,
                            "_"
                          );
                          return (
                            <tr key={`${session.id}-${student.studentId}`}>
                              <td>{formatShortFio(student.studentName)}</td>
                              <td>
                                <span className={`admin-internal-exam-status ${st.cls}`}>
                                  {st.label}
                                </span>
                              </td>
                              <td>
                                {session.examDate} {session.examTime}
                              </td>
                              <td>
                                {sheet?.totalPoints ?? student.totalPoints ?? "—"}
                              </td>
                              <td>
                                <div className="admin-internal-exam-row-actions">
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    disabled={!done || !sid}
                                    onClick={() => sid && exportWordOne(sid, base)}
                                  >
                                    Word
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    disabled={!done || !sid}
                                    onClick={() => sid && exportOne(sid, base)}
                                  >
                                    PDF
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="admin-settings-section-desc">Выберите группу для просмотра экзаменов.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
