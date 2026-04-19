import { useEffect, useMemo, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import {
  dateKeyToRuDisplay,
  localDateKey,
  sortSlotsByTime,
  weekdayRuFromDateKey,
} from "@/admin/scheduleFormat";
import {
  createInstructorBookingRequest,
  instructorCancelFreeDriveWindowReservation,
  instructorConfirmFreeDriveWindowReservation,
  instructorCreateFreeDriveWindow,
  instructorDeleteFreeDriveWindow,
  instructorDeleteDriveSlot,
  subscribeDriveSlotsForInstructor,
} from "@/firebase/drives";
import { mapFirebaseError } from "@/firebase/errors";
import { subscribeUsersByIds } from "@/firebase/instructorData";
import { DRIVE_TIME_OCCUPIED_MSG, hasDriveTimeOverlapOnInstructorDay } from "@/lib/driveTimeConflict";
import { isDriveSlotStartInPast, minTimeForDateKey } from "@/lib/driveSlotTime";
import {
  IconPendingDate,
  IconPendingPerson,
  IconPendingStatus,
} from "@/components/DrivePendingRowIcons";
import { useAuth } from "@/context/AuthContext";
import {
  countStudentCommittedBookings,
  evaluateStudentTalonBooking,
  INSTRUCTOR_TALON_MSG_INSUFFICIENT,
  INSTRUCTOR_TALON_MSG_ZERO,
  type TalonBookingBlockReason,
} from "@/lib/talonBooking";
import { InstructorInternalExamPanel } from "@/components/instructor/InstructorInternalExamPanel";
import { AlertDialog, ConfirmDialog } from "@/components/ConfirmDialog";
import { StudentLocationPickMap } from "@/components/StudentLocationPickMap";
import {
  geocodeAddressTuymazyRegion,
  hasYandexMapsApiKey,
  suggestAddressTuymazyRegion,
  type YandexSuggestItem,
} from "@/yandexMapsApi";
import type { DriveSlot, FreeDriveWindow, UserProfile } from "@/types";

function IconBookStudent() {
  return (
    <svg className="instructor-booking-ico" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
      />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
}

function IconNavigator() {
  return (
    <svg className="instructor-booking-ico" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.6A2.6 2.6 0 1 1 12 6.4a2.6 2.6 0 0 1 0 5.2z"
      />
    </svg>
  );
}

function IconRoute() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M2 19l20-7L2 5v5l14 2-14 2v5z"
      />
    </svg>
  );
}

function yandexRouteToUrl(lat: number, lng: number): string {
  return `https://yandex.ru/maps/?rtext=~${lat},${lng}&rtt=auto`;
}

export function InstructorBookingTab({ freeWindows }: { freeWindows: FreeDriveWindow[] }) {
  const { profile, user, refreshProfile } = useAuth();
  const instructorUid = user?.uid ?? profile?.uid ?? "";

  const [attachedStudents, setAttachedStudents] = useState<UserProfile[]>([]);
  const [slots, setSlots] = useState<DriveSlot[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [dateKey, setDateKey] = useState(() => localDateKey());
  const [startTime, setStartTime] = useState("09:00");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [deleteConfirmSlotId, setDeleteConfirmSlotId] = useState<string | null>(null);
  const [deleteConfirmWindowId, setDeleteConfirmWindowId] = useState<string | null>(null);
  const [windowFormOpen, setWindowFormOpen] = useState(false);
  const [windowDateKey, setWindowDateKey] = useState(() => localDateKey());
  const [windowStartTime, setWindowStartTime] = useState("09:00");
  const [windowSubmitBusy, setWindowSubmitBusy] = useState(false);
  const [windowActionBusyId, setWindowActionBusyId] = useState<string | null>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [navigatorAddress, setNavigatorAddress] = useState("");
  const [navigatorPoint, setNavigatorPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [navigatorFindBusy, setNavigatorFindBusy] = useState(false);
  const [navigatorSuggestBusy, setNavigatorSuggestBusy] = useState(false);
  const [navigatorSuggestOpen, setNavigatorSuggestOpen] = useState(false);
  const [navigatorSuggestResolved, setNavigatorSuggestResolved] = useState(false);
  const [navigatorSuggest, setNavigatorSuggest] = useState<YandexSuggestItem[]>([]);
  const [navigatorErr, setNavigatorErr] = useState<string | null>(null);
  const [talonBookingAlert, setTalonBookingAlert] = useState<TalonBookingBlockReason | null>(null);
  const [driveTimeOccupiedOpen, setDriveTimeOccupiedOpen] = useState(false);

  const attachedIds = useMemo(
    () => [...new Set(profile?.attachedStudentIds ?? [])],
    [profile?.attachedStudentIds]
  );
  const attachedIdsKey = useMemo(
    () => [...attachedIds].sort().join(","),
    [attachedIds]
  );

  useEffect(() => {
    if (profile?.role !== "instructor") return;
    void refreshProfile();
  }, [profile?.role, refreshProfile]);

  useEffect(() => {
    if (!instructorUid) {
      setAttachedStudents([]);
      return;
    }
    return subscribeUsersByIds(attachedIds, setAttachedStudents);
  }, [instructorUid, attachedIdsKey]);

  useEffect(() => {
    if (!instructorUid) {
      setSlots([]);
      return;
    }
    return subscribeDriveSlotsForInstructor(
      instructorUid,
      setSlots,
      (e) => setErr(e.message)
    );
  }, [instructorUid]);

  const studentMap = useMemo(() => {
    const m = new Map<string, UserProfile>();
    for (const s of attachedStudents) m.set(s.uid, s);
    return m;
  }, [attachedStudents]);

  const plannedSlots = useMemo(() => {
    /** Только ожидающие подтверждения; отменённые и подтверждённые — не показываем (см. «Мой график» / история). */
    const list = slots.filter((s) => s.status === "pending_confirmation");
    list.sort((a, b) => {
      const dk = a.dateKey.localeCompare(b.dateKey);
      if (dk !== 0) return dk;
      return sortSlotsByTime(a, b);
    });
    return list;
  }, [slots]);

  const todayKey = localDateKey();
  const minTime = minTimeForDateKey(dateKey);
  const minWindowTime = minTimeForDateKey(windowDateKey);

  useEffect(() => {
    if (dateKey !== todayKey) return;
    const min = minTimeForDateKey(dateKey);
    if (startTime < min) setStartTime(min);
  }, [dateKey, todayKey, startTime]);

  useEffect(() => {
    if (windowDateKey !== todayKey) return;
    const min = minTimeForDateKey(windowDateKey);
    if (windowStartTime < min) setWindowStartTime(min);
  }, [windowDateKey, todayKey, windowStartTime]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!instructorUid || !studentId.trim()) return;
    setSubmitBusy(true);
    setErr(null);
    try {
      if (isDriveSlotStartInPast(dateKey, startTime)) {
        setErr("Нельзя выбрать прошедшую дату и время.");
        return;
      }
      if (
        hasDriveTimeOverlapOnInstructorDay(
          instructorUid,
          dateKey,
          startTime,
          slots,
          freeWindows,
          undefined,
          undefined,
          true
        )
      ) {
        setDriveTimeOccupiedOpen(true);
        return;
      }
      const sid = studentId.trim();
      const st = studentMap.get(sid);
      const committed = countStudentCommittedBookings(slots, sid, freeWindows);
      const talonGate = evaluateStudentTalonBooking(st?.talons, committed);
      if (!talonGate.ok) {
        setTalonBookingAlert(talonGate.reason);
        return;
      }
      await createInstructorBookingRequest({
        instructorId: instructorUid,
        dateKey,
        startTime,
        studentId: sid,
        studentDisplayName: st?.displayName ?? "",
      });
      setFormOpen(false);
      setStudentId("");
    } catch (e: unknown) {
      const msg = mapFirebaseError(e);
      if (msg === DRIVE_TIME_OCCUPIED_MSG) setDriveTimeOccupiedOpen(true);
      else setErr(msg);
    } finally {
      setSubmitBusy(false);
    }
  }

  async function onDelete(slotId: string) {
    if (deleteBusyId) return;
    setDeleteBusyId(slotId);
    setErr(null);
    try {
      await instructorDeleteDriveSlot(slotId);
    } catch (e: unknown) {
      setErr(mapFirebaseError(e));
    } finally {
      setDeleteBusyId(null);
    }
  }

  async function onCreateFreeWindow(e: React.FormEvent) {
    e.preventDefault();
    if (!instructorUid) return;
    setWindowSubmitBusy(true);
    setErr(null);
    try {
      if (isDriveSlotStartInPast(windowDateKey, windowStartTime)) {
        setErr("Нельзя выбрать прошедшую дату и время.");
        return;
      }
      if (
        hasDriveTimeOverlapOnInstructorDay(
          instructorUid,
          windowDateKey,
          windowStartTime,
          slots,
          freeWindows
        )
      ) {
        setDriveTimeOccupiedOpen(true);
        return;
      }
      await instructorCreateFreeDriveWindow({
        instructorId: instructorUid,
        dateKey: windowDateKey,
        startTime: windowStartTime,
      });
      setWindowFormOpen(false);
    } catch (e: unknown) {
      const msg = mapFirebaseError(e);
      if (msg === DRIVE_TIME_OCCUPIED_MSG) setDriveTimeOccupiedOpen(true);
      else setErr(msg);
    } finally {
      setWindowSubmitBusy(false);
    }
  }

  async function onDeleteFreeWindow(windowId: string) {
    setWindowActionBusyId(windowId);
    setErr(null);
    try {
      await instructorDeleteFreeDriveWindow(windowId);
    } catch (e: unknown) {
      setErr(mapFirebaseError(e));
    } finally {
      setWindowActionBusyId(null);
    }
  }

  async function onConfirmWindow(windowId: string) {
    setWindowActionBusyId(windowId);
    setErr(null);
    try {
      await instructorConfirmFreeDriveWindowReservation(windowId);
    } catch (e: unknown) {
      const msg = mapFirebaseError(e);
      if (msg === DRIVE_TIME_OCCUPIED_MSG) setDriveTimeOccupiedOpen(true);
      else setErr(msg);
    } finally {
      setWindowActionBusyId(null);
    }
  }

  async function onCancelWindowReservation(windowId: string) {
    setWindowActionBusyId(windowId);
    setErr(null);
    try {
      await instructorCancelFreeDriveWindowReservation(windowId);
    } catch (e: unknown) {
      setErr(mapFirebaseError(e));
    } finally {
      setWindowActionBusyId(null);
    }
  }

  async function onNavigatorFind(overrideAddress?: string) {
    const addr = (overrideAddress ?? navigatorAddress).trim();
    setNavigatorErr(null);
    if (!addr) {
      setNavigatorErr("Введите адрес (улицу, дом)");
      return;
    }
    setNavigatorFindBusy(true);
    try {
      const coords = await geocodeAddressTuymazyRegion(addr);
      if (!coords) {
        setNavigatorErr("Адрес не найден. Уточните улицу и дом.");
        return;
      }
      setNavigatorPoint(coords);
    } catch {
      setNavigatorErr("Не удалось найти адрес. Проверьте сеть и попробуйте снова.");
    } finally {
      setNavigatorFindBusy(false);
    }
  }

  useEffect(() => {
    if (!navigatorOpen || !hasYandexMapsApiKey()) return;
    const q = navigatorAddress.trim();
    if (q.length < 2) {
      setNavigatorSuggest([]);
      setNavigatorSuggestBusy(false);
      setNavigatorSuggestResolved(false);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      setNavigatorSuggestResolved(false);
      setNavigatorSuggestBusy(true);
      void suggestAddressTuymazyRegion(q)
        .then((list) => {
          if (!cancelled) {
            setNavigatorSuggest(list);
            setNavigatorSuggestResolved(true);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setNavigatorSuggest([]);
            setNavigatorSuggestResolved(true);
          }
        })
        .finally(() => {
          if (!cancelled) setNavigatorSuggestBusy(false);
        });
    }, 240);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [navigatorAddress, navigatorOpen]);

  if (!profile) return null;

  return (
    <div className="admin-tab instructor-booking-tab">

      {err ? (
        <div className="form-error" role="alert">
          {err}
        </div>
      ) : null}

      <section
        className="instructor-booking-section instructor-booking-section--planned"
        aria-labelledby="planned-heading"
      >
        <h2 id="planned-heading" className="instructor-subtitle">
          Запланированные вождения
        </h2>
        {plannedSlots.length === 0 ? (
          <p className="admin-empty instructor-home-empty">Пока нет записей.</p>
        ) : (
          <ul className="instructor-booking-planned-list">
            {plannedSlots.map((sl) => {
              const st = studentMap.get(sl.studentId);
              const name = formatShortFio(st?.displayName ?? "") || "Курсант";
              const day = weekdayRuFromDateKey(sl.dateKey);
              const busy = deleteBusyId === sl.id;
              return (
                <li key={sl.id} className="instructor-booking-planned-item">
                  <div className="instructor-card instructor-card--student student-home-my-instructor">
                    <div className="instructor-preview-bar">
                      <div className="instructor-card-preview instructor-card-preview--student glossy-panel instructor-home-cadet-preview instructor-booking-planned-preview">
                        <div className="instructor-booking-planned-main">
                          <div className="drive-pending-notice-row">
                            <IconPendingDate />
                            <span className="drive-pending-notice-row-text">
                              <span className="drive-pending-notice-label">Дата:</span>{" "}
                              {day}, {dateKeyToRuDisplay(sl.dateKey)} · {sl.startTime || "—"}
                            </span>
                          </div>
                          <div className="drive-pending-notice-row">
                            <IconPendingPerson />
                            <span className="drive-pending-notice-row-text">
                              <span className="drive-pending-notice-label">Курсант:</span> {name}
                            </span>
                          </div>
                          <div className="drive-pending-notice-row">
                            <IconPendingStatus />
                            <span className="drive-pending-notice-row-text">
                              <span className="drive-pending-notice-label">Статус:</span>{" "}
                              <span className="drive-pending-status-value drive-pending-status-value--blink">
                                Ожидает подтверждения
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="instructor-preview-actions">
                        <button
                          type="button"
                          className="instr-side-btn glossy-btn instructor-booking-delete-side-btn"
                          onClick={() => setDeleteConfirmSlotId(sl.id)}
                          disabled={busy}
                          aria-label="Удалить вождение"
                          title="Удалить вождение"
                        >
                          <IconDelete />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="instructor-booking-section instructor-booking-section--planned">
        <h2 className="instructor-subtitle">Свободные окна</h2>
        {freeWindows.length === 0 ? (
          <p className="admin-empty instructor-home-empty">Свободных окон пока нет.</p>
        ) : (
          <ul className="instructor-booking-planned-list">
            {freeWindows.map((w) => {
              const st = w.studentId ? studentMap.get(w.studentId) : null;
              const name = st ? formatShortFio(st.displayName) || "Курсант" : "—";
              const day = weekdayRuFromDateKey(w.dateKey);
              const busy = windowActionBusyId === w.id;
              const reserved = w.status === "reserved" && !!w.studentId;
              return (
                <li key={w.id} className="instructor-booking-planned-item">
                  <div className="instructor-card instructor-card--student student-home-my-instructor">
                    <div className="instructor-preview-bar">
                      <div className="instructor-card-preview instructor-card-preview--student glossy-panel instructor-home-cadet-preview instructor-booking-planned-preview">
                        <div className="instructor-booking-planned-main">
                          <div className="drive-pending-notice-row">
                            <IconPendingDate />
                            <span className="drive-pending-notice-row-text">
                              <span className="drive-pending-notice-label">Дата:</span>{" "}
                              {day}, {dateKeyToRuDisplay(w.dateKey)} · {w.startTime || "—"}
                            </span>
                          </div>
                          <div className="drive-pending-notice-row">
                            <IconPendingPerson />
                            <span className="drive-pending-notice-row-text">
                              <span className="drive-pending-notice-label">Курсант:</span> {name}
                            </span>
                          </div>
                          <div className="drive-pending-notice-row">
                            <IconPendingStatus />
                            <span className="drive-pending-notice-row-text">
                              <span className="drive-pending-notice-label">Статус:</span>{" "}
                              <span
                                className={
                                  reserved
                                    ? "drive-live-status-text"
                                    : "drive-pending-status-value drive-pending-status-value--danger drive-pending-status-value--unbooked-glow"
                                }
                              >
                                {reserved ? "подтвердите бронь" : "не забронировано"}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="instructor-preview-actions">
                        {reserved ? (
                          <>
                            <button
                              type="button"
                              className="instr-side-btn glossy-btn student-pending-confirm-btn"
                              onClick={() => void onConfirmWindow(w.id)}
                              disabled={busy}
                              aria-label="Подтвердить бронь"
                              title="Подтвердить бронь"
                            >
                              <IconCheck />
                            </button>
                            <button
                              type="button"
                              className="instr-side-btn glossy-btn student-pending-decline-btn"
                              onClick={() => void onCancelWindowReservation(w.id)}
                              disabled={busy}
                              aria-label="Отменить бронь"
                              title="Отменить бронь"
                            >
                              <IconClose />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="instr-side-btn glossy-btn instructor-booking-delete-side-btn"
                            onClick={() => setDeleteConfirmWindowId(w.id)}
                            disabled={busy}
                            aria-label="Удалить окно"
                            title="Удалить окно"
                          >
                            <IconDelete />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        className="instructor-booking-section instructor-booking-section--create"
        aria-label="Запись курсанта"
      >
        <div className="instructor-booking-actions-row">
          <button
            type="button"
            className="instructor-booking-primary-btn glossy-panel"
            onClick={() => {
              setWindowFormOpen(false);
              setFormOpen(true);
            }}
            aria-expanded={formOpen}
          >
            <IconBookStudent />
            <span>Записать курсанта</span>
          </button>
          <button
            type="button"
            className="instructor-booking-primary-btn instructor-booking-primary-btn--purple glossy-panel"
            onClick={() => {
              setFormOpen(false);
              setWindowFormOpen(true);
            }}
            aria-expanded={windowFormOpen}
          >
            <IconBookStudent />
            <span>Добавить окно</span>
          </button>
        </div>
        <button
          type="button"
          className="instructor-booking-primary-btn instructor-booking-primary-btn--navigator glossy-panel"
            onClick={() => {
              setNavigatorAddress("");
              setNavigatorPoint(null);
              setNavigatorErr(null);
              setNavigatorSuggest([]);
              setNavigatorSuggestOpen(false);
              setNavigatorSuggestResolved(false);
              setNavigatorOpen(true);
            }}
        >
          <IconNavigator />
          <span>НАВИГАТОР</span>
        </button>

        <InstructorInternalExamPanel
          instructorUid={instructorUid}
          instructorName={profile.displayName?.trim() ? profile.displayName : "Инструктор"}
          attachedStudents={attachedStudents}
          placement="booking"
        />

        {formOpen ? (
          <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
            <form
              className="modal-panel instructor-booking-form glossy-panel"
              onSubmit={onSubmit}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="modal-title">Записать курсанта</h3>
              <label className="field">
                <span className="field-label">Курсант</span>
                <select
                  className="input"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  required
                >
                  <option value="">Выберите курсанта</option>
                  {attachedStudents.map((s) => (
                    <option key={s.uid} value={s.uid}>
                      {formatShortFio(s.displayName) || s.uid}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Дата</span>
                <input
                  type="date"
                  className="input"
                  value={dateKey}
                  min={todayKey}
                  onChange={(e) => setDateKey(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">Время начала</span>
                <input
                  type="time"
                  className="input"
                  value={startTime}
                  min={dateKey === todayKey ? minTime : undefined}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </label>
              <div className="modal-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitBusy || attachedStudents.length === 0}
                >
                  {submitBusy ? "Запись…" : "Записать"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setFormOpen(false)}
                  disabled={submitBusy}
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        ) : null}
        {windowFormOpen ? (
          <div className="modal-backdrop" role="presentation" onClick={() => setWindowFormOpen(false)}>
            <form
              className="modal-panel instructor-booking-form instructor-booking-form--purple glossy-panel"
              onSubmit={onCreateFreeWindow}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="modal-title">Добавить окно</h3>
              <label className="field">
                <span className="field-label">Дата</span>
                <input
                  type="date"
                  className="input"
                  value={windowDateKey}
                  min={todayKey}
                  onChange={(e) => setWindowDateKey(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">Время начала</span>
                <input
                  type="time"
                  className="input"
                  value={windowStartTime}
                  min={windowDateKey === todayKey ? minWindowTime : undefined}
                  onChange={(e) => setWindowStartTime(e.target.value)}
                  required
                />
              </label>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={windowSubmitBusy}>
                  {windowSubmitBusy ? "Добавление…" : "Добавить"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setWindowFormOpen(false)}
                  disabled={windowSubmitBusy}
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        ) : null}
        {navigatorOpen ? (
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => setNavigatorOpen(false)}
          >
            <div
              className="modal-panel instructor-booking-navigator-modal glossy-panel"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="modal-title">Навигатор</h3>
              {hasYandexMapsApiKey() ? (
                <div className="admin-gps-map-wrap student-loc-pick-map-wrap">
                  <StudentLocationPickMap
                    selected={navigatorPoint}
                    onSelect={(lat, lng) => {
                      setNavigatorErr(null);
                      setNavigatorPoint({ lat, lng });
                    }}
                  />
                </div>
              ) : (
                <p className="admin-gps-modal-hint">
                  Ключ карты не задан. Заполните <code>VITE_YANDEX_MAPS_API_KEY</code> в `.env`.
                </p>
              )}
              <div className="student-loc-address-row">
                <label className="student-loc-address-field">
                  <span className="student-loc-address-label-text">Адрес</span>
                  <input
                    type="text"
                    className="student-loc-address-input"
                    value={navigatorAddress}
                    onChange={(e) => {
                      setNavigatorAddress(e.target.value);
                      setNavigatorSuggestOpen(true);
                    }}
                    placeholder="Улица, дом"
                    autoComplete="street-address"
                    disabled={navigatorFindBusy}
                    onFocus={() => setNavigatorSuggestOpen(true)}
                    onBlur={() => {
                      window.setTimeout(() => setNavigatorSuggestOpen(false), 120);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void onNavigatorFind();
                      }
                    }}
                  />
                  {navigatorSuggestOpen &&
                  navigatorAddress.trim().length >= 2 &&
                  (navigatorSuggestBusy || navigatorSuggest.length > 0 || navigatorSuggestResolved) ? (
                    <div className="student-loc-suggest-list" role="listbox" aria-label="Подсказки адреса">
                      {navigatorSuggestBusy ? (
                        <button type="button" className="student-loc-suggest-item" disabled>
                          Поиск адресов...
                        </button>
                      ) : navigatorSuggest.length > 0 ? (
                        navigatorSuggest.map((s, idx) => (
                          <button
                            key={`${s.value}-${idx}`}
                            type="button"
                            className="student-loc-suggest-item"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setNavigatorAddress(s.value);
                              setNavigatorSuggestOpen(false);
                              void onNavigatorFind(s.value);
                            }}
                          >
                            <span className="student-loc-suggest-title">{s.title}</span>
                            {s.subtitle ? (
                              <span className="student-loc-suggest-subtitle">{s.subtitle}</span>
                            ) : null}
                          </button>
                        ))
                      ) : (
                        <button type="button" className="student-loc-suggest-item" disabled>
                          Ничего не найдено
                        </button>
                      )}
                    </div>
                  ) : null}
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm student-loc-address-find-btn"
                  onClick={() => void onNavigatorFind()}
                  disabled={navigatorFindBusy}
                >
                  {navigatorFindBusy ? "Поиск…" : "Найти"}
                </button>
              </div>
              {navigatorErr ? (
                <p className="form-error" role="alert">
                  {navigatorErr}
                </p>
              ) : null}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!navigatorPoint}
                  onClick={() => {
                    if (!navigatorPoint) return;
                    window.open(
                      yandexRouteToUrl(navigatorPoint.lat, navigatorPoint.lng),
                      "_blank",
                      "noopener,noreferrer"
                    );
                  }}
                >
                  <IconRoute /> Проложить маршрут
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setNavigatorOpen(false)}>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <AlertDialog
        open={talonBookingAlert !== null}
        message={
          talonBookingAlert === "insufficient"
            ? INSTRUCTOR_TALON_MSG_INSUFFICIENT
            : INSTRUCTOR_TALON_MSG_ZERO
        }
        onClose={() => setTalonBookingAlert(null)}
      />
      <AlertDialog
        open={driveTimeOccupiedOpen}
        message={DRIVE_TIME_OCCUPIED_MSG}
        onClose={() => setDriveTimeOccupiedOpen(false)}
      />
      <ConfirmDialog
        open={deleteConfirmSlotId != null}
        title="Вы уверены?"
        confirmLabel="Да"
        cancelLabel="Нет"
        onCancel={() => setDeleteConfirmSlotId(null)}
        onConfirm={() => {
          const id = deleteConfirmSlotId;
          if (!id) return;
          setDeleteConfirmSlotId(null);
          void onDelete(id);
        }}
      />
      <ConfirmDialog
        open={deleteConfirmWindowId != null}
        title="Вы уверены?"
        confirmLabel="Да"
        cancelLabel="Нет"
        onCancel={() => setDeleteConfirmWindowId(null)}
        onConfirm={() => {
          const id = deleteConfirmWindowId;
          if (!id) return;
          setDeleteConfirmWindowId(null);
          void onDeleteFreeWindow(id);
        }}
      />
    </div>
  );
}
