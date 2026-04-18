import { useCallback, useEffect, useMemo, useState } from "react";
import { InternalExamSheet } from "@/components/exam/InternalExamSheet";
import { ExamStudentCard } from "@/components/instructor/ExamStudentCard";
import { subscribeTrainingGroups } from "@/firebase/admin";
import type { TrainingGroup, UserProfile } from "@/types";
import type { InternalExamSession, InternalExamSheet as SheetModel } from "@/types/internalExam";
import { useInternalExam } from "@/hooks/useInternalExam";
import { getInternalExamSheet, startStudentExam } from "@/services/internalExamService";
import { openExamSheetPreview } from "@/services/examExportService";

type InstructorInternalExamPanelProps = {
  instructorUid: string;
  instructorName: string;
  attachedStudents: UserProfile[];
};

/**
 * Блок «Внутренний экзамен» на вкладке записи инструктора.
 */
export function InstructorInternalExamPanel({
  instructorUid,
  instructorName,
  attachedStudents,
}: InstructorInternalExamPanelProps) {
  const { sessions, loading, createExamSession, completeStudentExam: completeExamApi } =
    useInternalExam(instructorUid);

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
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId && sessions.length > 0) {
      setSessionId(sessions[0].id);
    }
  }, [sessions, sessionId]);

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
        setErr(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setStartBusy(null);
      }
    },
    []
  );

  const viewSheet = useCallback(async (examSheetId: string) => {
    const sheet = await getInternalExamSheet(examSheetId);
    if (sheet) openExamSheetPreview(sheet);
  }, []);

  if (!instructorUid) return null;

  return (
    <section className="instructor-internal-exam" aria-label="Внутренний экзамен">
      <div className="instructor-internal-exam__bar">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setPanelOpen((o) => !o)}
        >
          {panelOpen ? "Скрыть экзамен" : "Внутренний экзамен"}
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreateOpen(true)}>
              Новый экзамен
            </button>
            {sessions.length > 0 ? (
              <label className="instructor-internal-exam__select">
                <span className="field-label">Сессия</span>
                <select
                  className="input"
                  value={sessionId ?? ""}
                  onChange={(e) => setSessionId(e.target.value || null)}
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.groupName} · {s.examDate} {s.examTime}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {loading ? (
            <p className="admin-settings-section-desc">Загрузка…</p>
          ) : !currentSession ? (
            <p className="admin-settings-section-desc">Создайте сессию экзамена.</p>
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
                        onViewSheet={() => {
                          if (st.examSheetId) void viewSheet(st.examSheetId);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
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
    </section>
  );
}
