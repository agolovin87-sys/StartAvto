import { useEffect, useRef, useState } from "react";
import type { DriveSlot } from "@/types";
import { DriveLiveStudentTimerDecor } from "@/components/DriveLiveStudentTimerDecor";
import {
  instructorCancelLiveDriveSession,
  instructorPauseDriveLiveSession,
  instructorResumeDriveLiveSession,
} from "@/firebase/drives";
import { mapFirebaseError } from "@/firebase/errors";
import { driveLiveEffectiveElapsedMs } from "@/lib/driveLiveElapsed";
import { DRIVE_LIVE_DURATION_MS } from "@/lib/driveSession";
import { useDriveTripRecorder } from "@/hooks/useDriveTripRecorder";

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  );
}

function IconPlaySm() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M6 6h12v12H6V6z" />
    </svg>
  );
}

/** Как иконка удаления в карточке «Подтверждение записи» / «Мой инструктор». */
function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  );
}

const CANCEL_REASONS = [
  { id: "no_show" as const, label: "Курсант не явился" },
  { id: "vehicle_repair" as const, label: "ТС на ремонте" },
  { id: "other" as const, label: "Другая причина" },
];

type CancelStep = "pick" | "detail";

export function DriveLiveSessionPanel({
  slot,
  onCompleteLive,
  onActionError,
}: {
  slot: DriveSlot;
  onCompleteLive: () => Promise<void>;
  onActionError: (message: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [pauseBusy, setPauseBusy] = useState(false);
  const [stopBusy, setStopBusy] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelStep, setCancelStep] = useState<CancelStep>("pick");
  const [cancelReasonId, setCancelReasonId] = useState<(typeof CANCEL_REASONS)[number]["id"] | null>(
    null
  );
  const [cancelDetail, setCancelDetail] = useState("");
  const pauseFreezeRef = useRef<number | null>(null);
  const [pauseFrozenTick, setPauseFrozenTick] = useState(0);
  /**
   * Пока true — UI в режиме паузы, даже если снимок Firestore на миг потерял livePausedAt
   * (иначе таймер снова идёт доли секунды). Сбрасываем только по «Продолжить» или ошибке паузы.
   */
  const [pauseSticky, setPauseSticky] = useState(false);

  const tripRecordingEnabled =
    slot.liveStudentAckAt != null && slot.status === "scheduled";
  const tripRec = useDriveTripRecorder(slot, tripRecordingEnabled);

  const serverPauseActive =
    slot.liveStudentAckAt != null &&
    slot.livePausedAt != null &&
    slot.livePausedAt >= slot.liveStudentAckAt;
  const isPaused =
    serverPauseActive || pauseFreezeRef.current !== null || pauseSticky;

  const awaitingStudentAck = slot.liveStudentAckAt == null;

  useEffect(() => {
    if (isPaused) return;
    if (awaitingStudentAck) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isPaused, pauseFrozenTick, awaitingStudentAck]);

  const computedElapsedMs = driveLiveEffectiveElapsedMs(slot, now);
  const effectiveElapsedMs = (() => {
    if (slot.livePausedAt != null) {
      return driveLiveEffectiveElapsedMs(slot, now);
    }
    if (pauseFreezeRef.current !== null) {
      return pauseFreezeRef.current;
    }
    return computedElapsedMs;
  })();

  const autoCompleteFiredRef = useRef(false);
  useEffect(() => {
    autoCompleteFiredRef.current = false;
  }, [slot.id]);

  useEffect(() => {
    const elapsedMs = Math.min(Math.max(0, effectiveElapsedMs), DRIVE_LIVE_DURATION_MS);
    const remainingMs = DRIVE_LIVE_DURATION_MS - elapsedMs;
    if (isPaused || awaitingStudentAck || remainingMs > 0 || autoCompleteFiredRef.current) {
      return;
    }
    autoCompleteFiredRef.current = true;
    void (async () => {
      try {
        await tripRec.finalizeAndUpload();
      } catch {
        /* завершаем слот даже при сбое сохранения трека */
      }
      await onCompleteLive();
    })();
  }, [isPaused, awaitingStudentAck, effectiveElapsedMs, onCompleteLive, tripRec.finalizeAndUpload]);

  const remainingMin = Math.max(0, Math.ceil((DRIVE_LIVE_DURATION_MS - effectiveElapsedMs) / 60000));

  async function handleStopConfirm() {
    setStopBusy(true);
    onActionError("");
    try {
      await tripRec.finalizeAndUpload();
      await onCompleteLive();
      setStopConfirmOpen(false);
    } catch (e: unknown) {
      onActionError(mapFirebaseError(e));
    } finally {
      setStopBusy(false);
    }
  }

  async function handlePauseToggle() {
    setPauseBusy(true);
    onActionError("");
    try {
      if (slot.livePausedAt != null || pauseSticky) {
        const hadServerPause = slot.livePausedAt != null;
        setPauseSticky(false);
        pauseFreezeRef.current = null;
        setPauseFrozenTick((n) => n + 1);
        try {
          await instructorResumeDriveLiveSession(slot.id);
        } catch (e: unknown) {
          const msg = mapFirebaseError(e);
          if (/не на паузе/i.test(msg)) {
            setNow(Date.now());
          } else {
            onActionError(msg);
            if (hadServerPause) setPauseSticky(true);
          }
          return;
        }
        setNow(Date.now());
      } else {
        setPauseSticky(true);
        pauseFreezeRef.current = driveLiveEffectiveElapsedMs(slot, Date.now());
        setPauseFrozenTick((n) => n + 1);
        try {
          await instructorPauseDriveLiveSession(slot.id);
        } catch (e: unknown) {
          pauseFreezeRef.current = null;
          setPauseSticky(false);
          setPauseFrozenTick((n) => n + 1);
          onActionError(mapFirebaseError(e));
        }
      }
    } finally {
      setPauseBusy(false);
    }
  }

  function openCancel() {
    setCancelStep("pick");
    setCancelReasonId(null);
    setCancelDetail("");
    setCancelOpen(true);
  }

  async function submitCancel() {
    if (!cancelReasonId) return;
    const label = CANCEL_REASONS.find((r) => r.id === cancelReasonId)?.label ?? "";
    const detail = cancelDetail.trim();
    if (!detail) {
      onActionError("Кратко опишите причину");
      return;
    }
    const fullReason = `${label}. ${detail}`;
    setCancelBusy(true);
    onActionError("");
    try {
      await instructorCancelLiveDriveSession(slot.id, fullReason, {
        chargeTalonToInstructor: cancelReasonId === "no_show",
      });
      setCancelOpen(false);
    } catch (e: unknown) {
      onActionError(mapFirebaseError(e));
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <div className="drive-live-session-panel">
      {tripRecordingEnabled ? (
        <p className="field-hint drive-live-trip-rec-hint" aria-live="polite">
          История поездки:{" "}
          {tripRec.pointsCount > 0
            ? `${tripRec.pointsCount} точек GPS`
            : "ожидание сигнала…"}
          {tripRec.geoState === "denied"
            ? " (нет доступа к геолокации — разрешите в браузере)"
            : null}
          {tripRec.lastSyncStatus === "error"
            ? " (сервер: ошибка синхронизации, повтор при сети)"
            : null}
        </p>
      ) : null}
      <div className="drive-live-session-panel__hud">
        <div className="drive-live-session-panel__dial">
          <div className="drive-live-session-panel__dial-student-timer">
            <DriveLiveStudentTimerDecor
              slot={slot}
              nowMs={now}
              effectiveElapsedMs={effectiveElapsedMs}
            />
          </div>
        </div>
        <div
          className="drive-live-session-panel__toolbar instructor-preview-actions"
          role="group"
          aria-label="Управление вождением"
        >
          <button
            type="button"
            className={`instr-side-btn glossy-btn ${isPaused ? "instr-side-call" : "instr-side-chat"}`}
            disabled={pauseBusy || awaitingStudentAck}
            onClick={() => void handlePauseToggle()}
            aria-label={isPaused ? "Продолжить" : "Пауза"}
            title={isPaused ? "Продолжить" : "Пауза"}
          >
            {isPaused ? <IconPlaySm /> : <IconPause />}
          </button>
          <button
            type="button"
            className="instr-side-btn glossy-btn drive-live-stop-side-btn"
            disabled={stopBusy || awaitingStudentAck}
            onClick={() => setStopConfirmOpen(true)}
            aria-label="Завершить вождение"
            title="Завершить вождение"
          >
            <IconStop />
          </button>
          <button
            type="button"
            className="instr-side-btn glossy-btn student-pending-decline-btn"
            disabled={cancelBusy}
            onClick={openCancel}
            aria-label="Отменить вождение"
            title="Отменить вождение"
          >
            <IconTrash />
          </button>
        </div>
      </div>

      {stopConfirmOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !stopBusy && setStopConfirmOpen(false)}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drive-stop-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="drive-stop-confirm-title" className="modal-title">
              Вы уверены завершить вождение досрочно?
            </h2>
            <p className="field-hint">
              {remainingMin > 0
                ? `Ещё осталось ${remainingMin} мин.`
                : "Время почти вышло — можно завершить."}
            </p>
            <p className="field-hint">С курсанта будет списан 1 талон на баланс инструктора.</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={stopBusy}
                onClick={() => setStopConfirmOpen(false)}
              >
                Нет
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={stopBusy}
                onClick={() => void handleStopConfirm()}
              >
                Да
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !cancelBusy && setCancelOpen(false)}
        >
          <div
            className="modal-panel drive-live-cancel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drive-cancel-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="drive-cancel-title" className="modal-title">
              {cancelStep === "pick" ? "Причина отмены" : "Опишите причину"}
            </h2>
            {cancelStep === "pick" ? (
              <>
                <ul className="drive-live-cancel-reasons">
                  {CANCEL_REASONS.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="drive-live-reason-option glossy-btn"
                        onClick={() => {
                          setCancelReasonId(r.id);
                          setCancelStep("detail");
                        }}
                      >
                        {r.label}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setCancelOpen(false)}
                  >
                    Закрыть
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="field-hint">
                  {CANCEL_REASONS.find((r) => r.id === cancelReasonId)?.label}
                </p>
                {cancelReasonId === "no_show" ? (
                  <p className="field-hint">
                    С курсанта будет списан 1 талон на баланс инструктора.
                  </p>
                ) : null}
                <label className="drive-live-cancel-label" htmlFor="drive-cancel-detail">
                  Кратко опишите ситуацию
                </label>
                <textarea
                  id="drive-cancel-detail"
                  className="drive-live-cancel-textarea"
                  rows={3}
                  value={cancelDetail}
                  onChange={(e) => setCancelDetail(e.target.value)}
                  placeholder={
                    cancelReasonId === "vehicle_repair"
                      ? "Например: ремонт ходовой…"
                      : "Например: не выходит на связь с утра…"
                  }
                />
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={cancelBusy}
                    onClick={() => setCancelStep("pick")}
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={cancelBusy || !cancelDetail.trim()}
                    onClick={() => void submitCancel()}
                  >
                    Отменить вождение
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
