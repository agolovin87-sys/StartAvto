import { useCallback, useMemo, useState } from "react";
import type { InternalExamSheet as SheetModel } from "@/types/internalExam";
import {
  INTERNAL_EXAM_ERRORS,
  INTERNAL_EXAM_EXERCISES,
  INTERNAL_EXAM_ERROR_POINT_ORDER,
  INTERNAL_EXAM_FAIL_MIN_POINTS,
  emptyErrorState,
  emptyExerciseState,
  internalExamErrorSubsectionTitle,
  isInternalExamPassed,
  sumInternalExamPenaltyPoints,
} from "@/types/internalExam";
import { saveExamSheetDraft } from "@/services/internalExamService";
import type { CompleteExamInput } from "@/services/internalExamService";
import { exportExamSheetPDF, exportExamSheetWord } from "@/services/examExportService";

const INTERNAL_EXAM_ERROR_SUBSECTIONS = INTERNAL_EXAM_ERROR_POINT_ORDER.flatMap((pts) => {
  const list = INTERNAL_EXAM_ERRORS.filter((x) => x.points === pts);
  return list.length > 0 ? [{ pts, list }] : [];
});

type InternalExamSheetProps = {
  sessionId: string;
  baseSheet: SheetModel;
  onComplete: (payload: CompleteExamInput) => Promise<void>;
  onSaveDraft?: (data: Pick<SheetModel, "exercises" | "errors" | "examinerComment">) => Promise<void>;
  onClose: () => void;
};

/**
 * Форма экзаменационного листа: упражнения, штрафы по подразделам, итог и статус.
 */
export function InternalExamSheet({
  sessionId,
  baseSheet,
  onComplete,
  onSaveDraft,
  onClose,
}: InternalExamSheetProps) {
  const [exercises, setExercises] = useState(() => ({ ...emptyExerciseState(), ...baseSheet.exercises }));
  const [errors, setErrors] = useState(() => ({ ...emptyErrorState(), ...baseSheet.errors }));
  const [comment, setComment] = useState(baseSheet.examinerComment);
  const [busy, setBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const totalPoints = useMemo(() => sumInternalExamPenaltyPoints(errors), [errors]);
  const passed = useMemo(() => isInternalExamPassed(totalPoints), [totalPoints]);

  const toggleExercise = useCallback((id: string) => {
    setExercises((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleError = useCallback((id: string) => {
    setErrors((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const buildPayload = useCallback((): CompleteExamInput => {
    return {
      id: baseSheet.id,
      examSessionId: baseSheet.examSessionId || sessionId,
      studentId: baseSheet.studentId,
      studentName: baseSheet.studentName,
      instructorId: baseSheet.instructorId,
      instructorName: baseSheet.instructorName,
      examDate: baseSheet.examDate,
      examTime: baseSheet.examTime,
      exercises,
      errors,
      totalPoints,
      isPassed: passed,
      examinerComment: comment.trim(),
    };
  }, [
    baseSheet,
    sessionId,
    exercises,
    errors,
    totalPoints,
    passed,
    comment,
  ]);

  async function handleDraft() {
    setLocalErr(null);
    setDraftBusy(true);
    try {
      if (onSaveDraft) {
        await onSaveDraft({ exercises, errors, examinerComment: comment.trim() });
      } else {
        await saveExamSheetDraft(baseSheet.id, {
          exercises,
          errors,
          examinerComment: comment.trim(),
        });
      }
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "Не удалось сохранить черновик");
    } finally {
      setDraftBusy(false);
    }
  }

  async function handleFinish() {
    setLocalErr(null);
    setBusy(true);
    try {
      const done = buildPayload();
      await onComplete(done);
      const fname = `Внутренний_экзамен_${baseSheet.studentName.replace(/\s+/g, "_")}_${baseSheet.examDate}`;
      await exportExamSheetPDF(
        {
          ...done,
          createdAt: baseSheet.createdAt,
          isDraft: false,
        },
        fname
      );
      onClose();
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "Ошибка завершения");
    } finally {
      setBusy(false);
    }
  }

  function handleExportWord() {
    const p = buildPayload();
    exportExamSheetWord(
      { ...p, createdAt: baseSheet.createdAt, isDraft: false },
      `Экзамен_${baseSheet.studentName.replace(/\s+/g, "_")}_${baseSheet.examDate}`
    );
  }

  return (
    <div className="internal-exam-sheet">
      <div className="internal-exam-sheet__head">
        <h2 className="internal-exam-sheet__title">Экзаменационный лист</h2>
        <p className="internal-exam-sheet__meta">
          {baseSheet.studentName} · {baseSheet.examDate} {baseSheet.examTime}
        </p>
        {localErr ? (
          <p className="form-error" role="alert">
            {localErr}
          </p>
        ) : null}
      </div>

      <section className="internal-exam-sheet__section" aria-labelledby="ex-ex">
        <h3 id="ex-ex" className="internal-exam-sheet__h3">
          Упражнения
        </h3>
        <ul className="internal-exam-sheet__checks">
          {INTERNAL_EXAM_EXERCISES.map((e) => (
            <li key={e.id}>
              <label className="internal-exam-sheet__check">
                <input
                  type="checkbox"
                  checked={!!exercises[e.id]}
                  onChange={() => toggleExercise(e.id)}
                />
                <span>{e.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="internal-exam-sheet__section" aria-labelledby="ex-err-head">
        <h3 id="ex-err-head" className="internal-exam-sheet__h3 internal-exam-sheet__h3--major">
          Ошибки и нарушения, допущенные в процессе экзамена
        </h3>
        {INTERNAL_EXAM_ERROR_SUBSECTIONS.map((sec, idx) => (
          <div key={sec.pts} className="internal-exam-sheet__subsection">
            {idx > 0 ? <hr className="internal-exam-sheet__rule" /> : null}
            <h4 className="internal-exam-sheet__h4">{internalExamErrorSubsectionTitle(sec.pts)}</h4>
            <ul className="internal-exam-sheet__checks">
              {sec.list.map((e) => (
                <li key={e.id}>
                  <label className="internal-exam-sheet__check">
                    <input type="checkbox" checked={!!errors[e.id]} onChange={() => toggleError(e.id)} />
                    <span>
                      {e.label} ({e.points} б.)
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <div
        className={`internal-exam-sheet__total ${passed ? "internal-exam-sheet__total--pass" : "internal-exam-sheet__total--fail"}`}
        role="status"
      >
        <div className="internal-exam-sheet__total-line">
          <strong>Итого баллов: {totalPoints}</strong>
          <span className="internal-exam-sheet__total-hint">
            {" "}
            (суммируется по отмеченным пунктам; не сдан при {INTERNAL_EXAM_FAIL_MIN_POINTS} и более баллах)
          </span>
        </div>
        <div
          className={`internal-exam-sheet__verdict ${passed ? "internal-exam-sheet__verdict--pass" : "internal-exam-sheet__verdict--fail"}`}
        >
          Статус: {passed ? "Сдан" : "Не сдан"}
        </div>
      </div>

      <label className="field">
        <span className="field-label">Комментарий экзаменатора</span>
        <textarea
          className="input internal-exam-sheet__textarea"
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Можно оставить пустым"
        />
      </label>

      <div className="internal-exam-sheet__actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
          Назад
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void handleDraft()}
          disabled={busy || draftBusy}
        >
          {draftBusy ? "Сохранение…" : "Сохранить черновик"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={handleExportWord} disabled={busy}>
          Экспорт Word
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleFinish()} disabled={busy}>
          {busy ? "Завершение…" : "Завершить экзамен"}
        </button>
      </div>
      <p className="internal-exam-sheet__footnote">
        После «Завершить экзамен» формируется отчёт (PDF); данные сохраняются в системе — доступны вам, курсанту и
        администратору.
      </p>
    </div>
  );
}
