import { useCallback, useEffect, useMemo, useState } from "react";
import { InternalExamSheet } from "@/components/exam/InternalExamSheet";
import { ExamStudentCard } from "@/components/instructor/ExamStudentCard";
import { subscribeTrainingGroups } from "@/firebase/admin";
import type { TrainingGroup, UserProfile } from "@/types";
import type { InternalExamSession, InternalExamSheet as SheetModel } from "@/types/internalExam";
import { useInternalExam } from "@/hooks/useInternalExam";
import { getInternalExamSheet, startStudentExam } from "@/services/internalExamService";
import { exportExamSheetPDF } from "@/services/examExportService";
import { AlertDialog, ConfirmDialog } from "@/components/ConfirmDialog";

type InstructorInternalExamPanelProps = {
  instructorUid: string;
  instructorName: string;
  attachedStudents: UserProfile[];
  /** Вкладка «Запись»: крупная кнопка на всю ширину под «Навигатор». */
  placement?: "default" | "booking";
};

function IconInternalExamBooking() {
  return (
    <svg className="instructor-booking-ico" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
      />
    </svg>
  );
}

function IconArchiveSession({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"
      />
    </svg>
  );
}

function IconDeleteSession({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  );
}

function IconNewSession({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
      />
    </svg>
  );
}

/**
 * Блок «Внутренний экзамен» на вкладке записи инструктора.
 */
export function InstructorInternalExamPanel({
  instructorUid,
  instructorName,
  attachedStudents,
  placement = "default",
}: InstructorInternalExamPanelProps) {
  const {
    sessions,
    loading,
    createExamSession,
    completeStudentExam: completeExamApi,
    archiveExamSession,
    dismissInstructorArchive,
    deleteExamSession,
  } = useInternalExam(instructorUid);

  const [panelOpen, setPanelOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [trainingGroups, setTrainingGroups] = useState<TrainingGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [examTime, setExamTime] = useState("09:00");
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [createBusy, setCreateBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sheetOverlay, setSheetOverlay] = useState<SheetModel | null>(null);
  const [overlaySessionId, setOverlaySessionId] = useState<string | null>(null);
  const [startBusy, setStartBusy] = useState<string | null>(null);
  const [doneCollapsed, setDoneCollapsed] = useState(false);
  /** true = блок «Архив» свёрнут (по умолчанию) */
  const [archiveCollapsed, setArchiveCollapsed] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  /** id сессии, для которой открыто подтверждение переноса в архив */
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [examTalonZeroAlertOpen, setExamTalonZeroAlertOpen] = useState(false);

  const activeSessions = useMemo(
    () => sessions.filter((s) => s.instructorArchivedAt == null),
    [sessions]
  );
  const archivedSessions = useMemo(
    () =>
      sessions.filter(
        (s) => s.instructorArchivedAt != null && s.instructorArchiveDismissedAt == null
      ),
    [sessions]
  );

  const [expandedArchiveSessionId, setExpandedArchiveSessionId] = useState<string | null>(null);
  const [dismissArchiveTargetId, setDismissArchiveTargetId] = useState<string | null>(null);
  const [dismissArchiveBusy, setDismissArchiveBusy] = useState(false);

  useEffect(() => {
    if (sessions.length === 0) {
      setSessionId(null);
      return;
    }
    if (!sessionId || !activeSessions.some((s) => s.id === sessionId)) {
      setSessionId(activeSessions[0]?.id ?? null);
    }
  }, [sessions, sessionId, activeSessions]);

  useEffect(() => {
    return subscribeTrainingGroups(setTrainingGroups);
  }, []);

  const studentsInSelectedGroup = useMemo(() => {
    if (!selectedGroupId.trim()) return [];
    return attachedStudents.filter((s) => (s.groupId ?? "").trim() === selectedGroupId);
  }, [attachedStudents, selectedGroupId]);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === sessionId) ?? null,
    [sessions, sessionId]
  );

  const pendingList = useMemo(() => {
    if (!currentSession) return [];
    return currentSession.students.filter(
      (s) => s.status === "pending" || s.status === "in_progress"
    );
  }, [currentSession]);

  const doneList = useMemo(() => {
    if (!currentSession) return [];
    return currentSession.students.filter((s) => s.status === "passed" || s.status === "failed");
  }, [currentSession]);

  const toggleStudent = useCallback((id: string) => {
    setPick((p) => ({ ...p, [id]: !p[id] }));
  }, []);

  const onSelectGroup = useCallback((groupId: string) => {
    setSelectedGroupId(groupId);
    setPick({});
  }, []);

  async function submitCreate() {
    const ids = Object.entries(pick)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (ids.length === 0) {
      setErr("Отметьте хотя бы одного курсанта.");
      return;
    }
    const gid = selectedGroupId.trim();
    if (!gid) {
      setErr("Выберите учебную группу (список задаётся администратором).");
      return;
    }
    const group = trainingGroups.find((g) => g.id === gid);
    if (!group) {
      setErr("Группа не найдена. Обновите страницу и выберите группу снова.");
      return;
    }
    setErr(null);
    setCreateBusy(true);
    try {
      const gname = group.name.trim();
      const students = ids.map((id) => {
        const st = attachedStudents.find((x) => x.uid === id);
        return {
          studentId: id,
          studentName: st?.displayName ?? "",
          studentGroup: gname,
        };
      });
      const sid = await createExamSession({
        instructorId: instructorUid,
        instructorName,
        groupId: gid,
        groupName: gname,
        examDate,
        examTime,
        students,
      });
      setSessionId(sid);
      setCreateOpen(false);
      setPick({});
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось создать сессию");
    } finally {
      setCreateBusy(false);
    }
  }

  const openSheetForStudent = useCallback(
    async (session: InternalExamSession, studentId: string) => {
      setErr(null);
      setStartBusy(studentId);
      try {
        let st = session.students.find((x) => x.studentId === studentId);
        let sheetId = st?.examSheetId;
        if (!sheetId || st?.status === "pending") {
          sheetId = await startStudentExam(session.id, studentId);
        }
        const sheet = await getInternalExamSheet(sheetId);
        if (!sheet) throw new Error("Лист не найден");
        setOverlaySessionId(session.id);
        setSheetOverlay(sheet);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Ошибка";
        if (message === "У курсанта 0 экзаменационных талонов, начать не возможно!") {
          setExamTalonZeroAlertOpen(true);
          setErr(null);
        } else {
          setErr(message);
        }
      } finally {
        setStartBusy(null);
      }
    },
    []
  );

  /** Скачивание листа в PDF (без всплывающего окна — надёжнее, чем HTML-превью). */
  const downloadExamSheetPdf = useCallback(async (examSheetId: string | undefined) => {
    if (!examSheetId?.trim()) {
      setErr("Нет привязанного листа экзамена.");
      return;
    }
    setErr(null);
    try {
      const sheet = await getInternalExamSheet(examSheetId);
      if (!sheet) {
        setErr("Лист не найден.");
        return;
      }
      if (sheet.isDraft) {
        setErr("Лист ещё в черновике — откройте экзамен и завершите его.");
        return;
      }
      const fname = `Внутренний_экзамен_${sheet.studentName.replace(/\s+/g, "_")}_${sheet.examDate}`;
      await exportExamSheetPDF(sheet, fname);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось сформировать PDF");
    }
  }, []);

  const archiveTargetSession = useMemo(
    () => (archiveTargetId ? sessions.find((s) => s.id === archiveTargetId) ?? null : null),
    [sessions, archiveTargetId]
  );

  const dismissArchiveTargetSession = useMemo(
    () => (dismissArchiveTargetId ? sessions.find((s) => s.id === dismissArchiveTargetId) ?? null : null),
    [sessions, dismissArchiveTargetId]
  );

  const deleteTargetSession = useMemo(
    () => (deleteTargetId ? sessions.find((s) => s.id === deleteTargetId) ?? null : null),
    [sessions, deleteTargetId]
  );

  async function onConfirmDismissInstructorArchive() {
    if (!dismissArchiveTargetId) return;
    const sid = dismissArchiveTargetId;
    setDismissArchiveBusy(true);
    setErr(null);
    try {
      await dismissInstructorArchive(sid);
      if (expandedArchiveSessionId === sid) setExpandedArchiveSessionId(null);
      setDismissArchiveTargetId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось убрать из архива");
    } finally {
      setDismissArchiveBusy(false);
    }
  }

  async function onConfirmArchiveSession() {
    if (!archiveTargetId) return;
    const sid = archiveTargetId;
    setArchiveBusy(true);
    setErr(null);
    try {
      await archiveExamSession(sid);
      if (overlaySessionId === sid) {
        setSheetOverlay(null);
        setOverlaySessionId(null);
      }
      setArchiveTargetId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось перенести сессию в архив");
    } finally {
      setArchiveBusy(false);
    }
  }

  async function onConfirmDeleteSession() {
    if (!deleteTargetId) return;
    const sid = deleteTargetId;
    setDeleteBusy(true);
    setErr(null);
    try {
      await deleteExamSession(sid);
      if (overlaySessionId === sid) {
        setSheetOverlay(null);
        setOverlaySessionId(null);
      }
      if (sessionId === sid) setSessionId(null);
      setDeleteTargetId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось удалить сессию");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!instructorUid) return null;

  const bookingUi = placement === "booking";

  return (
    <section
      className={
        bookingUi
          ? "instructor-internal-exam instructor-internal-exam--booking"
          : "instructor-internal-exam"
      }
      aria-label="Внутренний экзамен"
    >
      <div className="instructor-internal-exam__bar">
        <button
          type="button"
          className={
            bookingUi
              ? "instructor-booking-primary-btn instructor-booking-primary-btn--internal-exam glossy-panel"
              : "btn btn-primary btn-sm"
          }
          onClick={() => setPanelOpen((o) => !o)}
        >
          {bookingUi ? <IconInternalExamBooking /> : null}
          <span>{panelOpen ? "Скрыть экзамен" : "Внутренний экзамен"}</span>
        </button>
      </div>

      {panelOpen ? (
        <div className="instructor-internal-exam__body">
          {err ? (
            <p className="form-error" role="alert">
              {err}
            </p>
          ) : null}
          <div className="instructor-internal-exam__toolbar">
            <button
              type="button"
              className="btn btn-ghost btn-sm instructor-internal-exam__new-session-btn"
              onClick={() => setCreateOpen(true)}
            >
              <IconNewSession className="instructor-internal-exam__new-session-ico" />
              <span>Новый экзамен</span>
            </button>
          </div>
          {activeSessions.length > 0 ? (
            <div className="instructor-internal-exam__session-block">
              <span className="field-label" id="internal-exam-sessions-label">
                Сессии
              </span>
              <ul
                className="instructor-internal-exam__session-list"
                role="listbox"
                aria-labelledby="internal-exam-sessions-label"
                aria-activedescendant={sessionId ? `internal-exam-session-${sessionId}` : undefined}
              >
                {activeSessions.map((s) => {
                  const selected = s.id === sessionId;
                  return (
                    <li
                      key={s.id}
                      id={`internal-exam-session-${s.id}`}
                      className={
                        selected
                          ? "instructor-internal-exam__session-row instructor-internal-exam__session-row--current"
                          : "instructor-internal-exam__session-row"
                      }
                      role="option"
                      aria-selected={selected}
                    >
                      <button
                        type="button"
                        className="instructor-internal-exam__session-pick"
                        onClick={() => setSessionId(s.id)}
                      >
                        <span className="instructor-internal-exam__session-pick-text">
                          {s.groupName} · {s.examDate} {s.examTime}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm instructor-internal-exam__session-delete"
                        disabled={archiveBusy || deleteBusy}
                        title="Удалить сессию"
                        aria-busy={deleteBusy && deleteTargetId === s.id}
                        aria-label={
                          deleteBusy && deleteTargetId === s.id
                            ? `Удаление: ${s.groupName} ${s.examDate}`
                            : `Удалить сессию: ${s.groupName} ${s.examDate}`
                        }
                        onClick={() => setDeleteTargetId(s.id)}
                      >
                        {deleteBusy && deleteTargetId === s.id ? (
                          <span className="instructor-internal-exam__session-archive-busy" aria-hidden>
                            …
                          </span>
                        ) : (
                          <IconDeleteSession className="instructor-internal-exam__session-delete-ico" />
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm instructor-internal-exam__session-archive"
                        disabled={archiveBusy || deleteBusy}
                        title="Перенести сессию в архив"
                        aria-busy={archiveBusy && archiveTargetId === s.id}
                        aria-label={
                          archiveBusy && archiveTargetId === s.id
                            ? `Архивирование: ${s.groupName} ${s.examDate}`
                            : `В архив: ${s.groupName} ${s.examDate}`
                        }
                        onClick={() => setArchiveTargetId(s.id)}
                      >
                        {archiveBusy && archiveTargetId === s.id ? (
                          <span className="instructor-internal-exam__session-archive-busy" aria-hidden>
                            …
                          </span>
                        ) : (
                          <IconArchiveSession className="instructor-internal-exam__session-archive-ico" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {loading ? (
            <p className="admin-settings-section-desc">Загрузка…</p>
          ) : !currentSession ? (
            <p className="admin-settings-section-desc">
              {sessions.length === 0
                ? "Создайте сессию экзамена."
                : "Нет активных сессий. Завершённые сессии смотрите в разделе «Архив» ниже."}
            </p>
          ) : (
            <>
              <h3 className="instructor-internal-exam__subh">К сдаче</h3>
              <ul className="instructor-internal-exam__cards">
                {pendingList.map((st) => (
                  <li key={st.studentId}>
                    <ExamStudentCard
                      student={st}
                      startBusy={startBusy === st.studentId}
                      onStartExam={() => void openSheetForStudent(currentSession, st.studentId)}
                      onViewSheet={() => {}}
                    />
                  </li>
                ))}
              </ul>
              {pendingList.length === 0 ? (
                <p className="admin-settings-section-desc">Нет курсантов в очереди.</p>
              ) : null}

              <div className="instructor-internal-exam__done-head">
                <button
                  type="button"
                  className="instructor-home-section-toggle instructor-internal-exam__done-toggle"
                  aria-expanded={!doneCollapsed}
                  onClick={() => setDoneCollapsed((c) => !c)}
                >
                  <span className="instructor-home-section-toggle-label">Завершённые</span>
                  <span className="instructor-home-section-toggle-meta">{doneList.length}</span>
                </button>
              </div>
              {!doneCollapsed ? (
                <ul className="instructor-internal-exam__cards">
                  {doneList.map((st) => (
                    <li key={st.studentId}>
                      <ExamStudentCard
                        student={st}
                        onStartExam={() => {}}
                        onViewSheet={() => void downloadExamSheetPdf(st.examSheetId)}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
          {!loading && archivedSessions.length > 0 ? (
            <div className="instructor-internal-exam__archive-block">
              <div className="instructor-internal-exam__done-head">
                <button
                  type="button"
                  className="instructor-home-section-toggle instructor-internal-exam__done-toggle"
                  aria-expanded={!archiveCollapsed}
                  onClick={() => setArchiveCollapsed((c) => !c)}
                >
                  <span className="instructor-home-section-toggle-label">Архив</span>
                  <span className="instructor-home-section-toggle-meta">{archivedSessions.length}</span>
                </button>
              </div>
              {!archiveCollapsed ? (
                <>
                  <p className="instructor-internal-exam__archive-hint">
                    Сессии остаются у курсантов и в админке; здесь только ваш список для справки.
                  </p>
                  <ul className="instructor-internal-exam__archive-list" aria-label="Архив сессий">
                    {archivedSessions.map((s) => {
                      const expanded = expandedArchiveSessionId === s.id;
                      return (
                        <li key={s.id} className="instructor-internal-exam__archive-item">
                          <div className="instructor-internal-exam__archive-item-head">
                            <button
                              type="button"
                              className="instructor-internal-exam__archive-toggle"
                              aria-expanded={expanded}
                              onClick={() => setExpandedArchiveSessionId(expanded ? null : s.id)}
                            >
                              <span className="instructor-internal-exam__archive-text">
                                {s.groupName} · {s.examDate} {s.examTime}
                              </span>
                              <span className="instructor-internal-exam__archive-chevron" aria-hidden>
                                {expanded ? "▼" : "▶"}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              disabled={dismissArchiveBusy}
                              onClick={() => setDismissArchiveTargetId(s.id)}
                            >
                              Удалить
                            </button>
                          </div>
                          {expanded ? (
                            <div className="instructor-internal-exam__archive-detail">
                              <p className="instructor-internal-exam__archive-detail-hint">
                                Просмотр листов (PDF). У курсанта экзамен не меняется.
                              </p>
                              <ul className="instructor-internal-exam__cards">
                                {s.students.map((st) => (
                                  <li key={st.studentId}>
                                    <ExamStudentCard
                                      student={st}
                                      readOnlyArchive
                                      onStartExam={() => {}}
                                      onViewSheet={() => void downloadExamSheetPdf(st.examSheetId)}
                                    />
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {createOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !createBusy && setCreateOpen(false)}
        >
          <div
            className="modal-panel internal-exam-create-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="modal-title">Выбор курсантов для экзамена</h2>
            <label className="field">
              <span className="field-label">Учебная группа</span>
              <select
                className="input"
                value={selectedGroupId}
                onChange={(e) => onSelectGroup(e.target.value)}
              >
                <option value="">— Выберите группу —</option>
                {trainingGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              {trainingGroups.length === 0 ? (
                <span className="field-hint">Администратор ещё не создал учебные группы.</span>
              ) : null}
            </label>
            <label className="field">
              <span className="field-label">Дата экзамена</span>
              <input
                className="input"
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Время</span>
              <input
                className="input"
                type="time"
                value={examTime}
                onChange={(e) => setExamTime(e.target.value)}
              />
            </label>
            <div className="internal-exam-create-modal__list">
              {!selectedGroupId.trim() ? (
                <p className="field-hint">Сначала выберите учебную группу — появятся закреплённые за вами курсанты из неё.</p>
              ) : attachedStudents.length === 0 ? (
                <p>Нет закреплённых курсантов.</p>
              ) : studentsInSelectedGroup.length === 0 ? (
                <p>Нет закреплённых курсантов в выбранной группе (проверьте, что курсанты переведены в эту группу администратором).</p>
              ) : (
                studentsInSelectedGroup.map((s) => (
                  <label key={s.uid} className="internal-exam-create-modal__row">
                    <input
                      type="checkbox"
                      checked={!!pick[s.uid]}
                      onChange={() => toggleStudent(s.uid)}
                    />
                    <span>{s.displayName}</span>
                  </label>
                ))
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" disabled={createBusy} onClick={() => setCreateOpen(false)}>
                Отмена
              </button>
              <button type="button" className="btn btn-primary" disabled={createBusy} onClick={() => void submitCreate()}>
                {createBusy ? "Создание…" : "Начать экзамен"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sheetOverlay && overlaySessionId ? (
        <div className="modal-backdrop internal-exam-sheet-backdrop" role="presentation">
          <div
            className="modal-panel internal-exam-sheet-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <InternalExamSheet
              sessionId={overlaySessionId}
              baseSheet={sheetOverlay}
              onClose={() => {
                setSheetOverlay(null);
                setOverlaySessionId(null);
              }}
              onComplete={async (payload) => {
                await completeExamApi(overlaySessionId, payload.studentId, payload);
              }}
            />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={dismissArchiveTargetId != null}
        title="Убрать сессию из вашего архива?"
        message={
          dismissArchiveTargetSession
            ? `«${dismissArchiveTargetSession.groupName}» · ${dismissArchiveTargetSession.examDate} ${dismissArchiveTargetSession.examTime}. Запись исчезнет только у вас; у курсанта и в админке экзамен останется. Продолжить?`
            : "Запись исчезнет только у вас; у курсанта и в админке экзамен останется. Продолжить?"
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        onConfirm={() => {
          if (dismissArchiveBusy) return;
          void onConfirmDismissInstructorArchive();
        }}
        onCancel={() => {
          if (!dismissArchiveBusy) setDismissArchiveTargetId(null);
        }}
      />

      <ConfirmDialog
        open={deleteTargetId != null}
        title="Удалить сессию экзамена?"
        message={
          deleteTargetSession
            ? `«${deleteTargetSession.groupName}» · ${deleteTargetSession.examDate} ${deleteTargetSession.examTime}. Сессия и все листы будут удалены без восстановления; у курсантов и в админке эта запись исчезнет. Продолжить?`
            : "Сессия и листы будут удалены без восстановления. Продолжить?"
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        onConfirm={() => {
          if (deleteBusy) return;
          void onConfirmDeleteSession();
        }}
        onCancel={() => {
          if (!deleteBusy) setDeleteTargetId(null);
        }}
      />

      <ConfirmDialog
        open={archiveTargetId != null}
        title="Перенести сессию в архив?"
        message={
          archiveTargetSession
            ? `«${archiveTargetSession.groupName}» · ${archiveTargetSession.examDate} ${archiveTargetSession.examTime}. Сессия скроется из основного списка и появится внизу в разделе «Архив». У курсантов и у администратора экзамен останется без изменений. Продолжить?`
            : "Сессия скроется из основного списка и появится в разделе «Архив». У курсантов и у администратора экзамен останется без изменений. Продолжить?"
        }
        confirmLabel="В архив"
        cancelLabel="Отмена"
        onConfirm={() => {
          if (archiveBusy) return;
          void onConfirmArchiveSession();
        }}
        onCancel={() => {
          if (!archiveBusy) setArchiveTargetId(null);
        }}
      />

      <AlertDialog
        open={examTalonZeroAlertOpen}
        title="Недостаточно талонов"
        message="У курсанта 0 экзаменационных талонов, начать не возможно!"
        okLabel="Ок"
        onClose={() => setExamTalonZeroAlertOpen(false)}
      />
    </section>
  );
}
