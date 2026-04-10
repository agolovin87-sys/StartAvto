import { useEffect, useMemo, useRef, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import {
  driveHistoryTableDateCell,
  formatMsLocalHHmm,
  isDriveStartedBeforeScheduled,
} from "@/admin/scheduleFormat";
import { useAuth } from "@/context/AuthContext";
import { fetchDriveSlotsForInstructor } from "@/firebase/drives";
import { fetchTalonHistoryForUser, type TalonHistoryEntry } from "@/firebase/history";
import { getUserProfile } from "@/firebase/users";
import type { DriveSlot, UserRole } from "@/types";

/** Кошелёк / баланс — вместо прежнего «билета». */
function IconTalonBalance() {
  return (
    <svg
      className="instructor-history-talon-ico instructor-history-talon-ico--stroke"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V6a2.25 2.25 0 012.25-2.25h15A2.25 2.25 0 0121 6v6"
      />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`instr-chevron${open ? " is-open" : ""}`}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path fill="currentColor" d="M7 10l5 5 5-5z" />
    </svg>
  );
}

function IconDrive() {
  return (
    <svg className="instructor-history-drive-ico" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 17c-.83 0-1.5-.67-1.5-1.5S5.67 14 6.5 14s1.5.67 1.5 1.5S7.33 17 6.5 17zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5.85 11h12.29l1.04 3H4.81l1.04-3z"
      />
    </svg>
  );
}

/** Завершённые и отменённые вождения для журнала. */
function filterDriveHistorySlots(slots: DriveSlot[]): DriveSlot[] {
  return slots
    .filter((s) => s.status === "completed" || s.status === "cancelled")
    .sort((a, b) => {
      const dk = b.dateKey.localeCompare(a.dateKey);
      if (dk !== 0) return dk;
      return b.startTime.localeCompare(a.startTime, undefined, { numeric: true });
    });
}

function driveHistoryStatusLines(slot: DriveSlot): { lines: string[] } {
  if (slot.status === "completed") {
    return { lines: ["Статус: завершено"] };
  }
  if (slot.status === "cancelled") {
    const by =
      slot.cancelledByRole === "student"
        ? "курсантом"
        : slot.cancelledByRole === "instructor"
          ? "инструктором"
          : slot.cancelledByRole === "admin"
            ? "администратором"
            : null;
    const head = by
      ? `Статус: вождение отменено (${by}).`
      : "Статус: вождение отменено.";
    const reason = slot.cancelReason.trim();
    return {
      lines: [head, reason ? `Причина: ${reason}` : "Причина: —"],
    };
  }
  return { lines: ["—"] };
}

const roleLabel: Record<UserRole, string> = {
  admin: "Администратор",
  instructor: "Инструктор",
  student: "Курсант",
};

/** Подпись роли в колонке «Кем» (для админа — кратко «Админ»). */
function partyFromRoleLabel(role: UserRole): string {
  if (role === "admin") return "Админ";
  return roleLabel[role];
}

function formatRuDateTime(ms: number): string {
  const d = new Date(ms);
  const date = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date}, ${time}`;
}

/** Время для строки журнала: фактическое завершение или начало по слоту. */
function driveSlotTalonAnchorMs(slot: DriveSlot): number {
  if (slot.liveEndedAt != null) return slot.liveEndedAt;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(slot.dateKey.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(slot.startTime.trim() || "12:00");
  if (!m) return slot.createdAt;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = tm ? Number(tm[1]) : 12;
  const min = tm ? Number(tm[2]) : 0;
  return new Date(y, mo - 1, d, hh, min).getTime();
}

/** Если в Firestore нет строк журнала — показываем зачисления +1 по завершённым вождениям (старые данные). */
function completedDriveToSyntheticTalonEntry(
  instructorUid: string,
  instructorDisplayName: string,
  slot: DriveSlot,
  resolvedCadetName: string
): TalonHistoryEntry {
  const fromName =
    resolvedCadetName.trim() || slot.studentDisplayName.trim();
  return {
    id: `synth-drive-${slot.id}`,
    at: driveSlotTalonAnchorMs(slot),
    targetUid: instructorUid,
    targetRole: "instructor",
    targetDisplayName: instructorDisplayName,
    delta: 1,
    previousTalons: 0,
    newTalons: 1,
    fromUid: slot.studentId,
    fromRole: "student",
    fromDisplayName: fromName,
  };
}

export function InstructorHistoryTab() {
  const { user, profile } = useAuth();
  const instructorUid = (user?.uid ?? profile?.uid ?? "").trim();
  const [entries, setEntries] = useState<TalonHistoryEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [talonSectionOpen, setTalonSectionOpen] = useState(false);

  const [driveSlots, setDriveSlots] = useState<DriveSlot[]>([]);
  const [driveErr, setDriveErr] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [driveSectionOpen, setDriveSectionOpen] = useState(false);
  const [studentNameById, setStudentNameById] = useState<Record<string, string>>({});
  const loadedStudentIdsRef = useRef<Set<string>>(new Set());

  const driveHistorySlots = useMemo(() => filterDriveHistorySlots(driveSlots), [driveSlots]);

  const completedDrives = useMemo(
    () => driveSlots.filter((s) => s.status === "completed"),
    [driveSlots]
  );

  const talonBalanceRows = useMemo(() => {
    if (entries.length > 0) {
      return [...entries].sort((a, b) => b.at - a.at);
    }
    const insName = profile?.displayName?.trim() ?? "";
    return completedDrives
      .map((s) =>
        completedDriveToSyntheticTalonEntry(
          instructorUid,
          insName,
          s,
          studentNameById[s.studentId] ?? ""
        )
      )
      .sort((a, b) => b.at - a.at);
  }, [entries, completedDrives, instructorUid, profile?.displayName, studentNameById]);

  const talonBalanceSynthOnly =
    entries.length === 0 && completedDrives.length > 0 && talonBalanceRows.length > 0;

  /**
   * Вкладка «История» — только getDocs, без onSnapshot по слотам/журналу.
   * Два лишних слушателя на те же запросы, что и «Главная», провоцировали сбои Firestore SDK;
   * для архива достаточно загрузки и обновления при возврате на страницу.
   */
  useEffect(() => {
    if (!instructorUid) {
      setEntries([]);
      setDriveSlots([]);
      loadedStudentIdsRef.current = new Set();
      setStudentNameById({});
      setHistoryLoading(false);
      return;
    }

    loadedStudentIdsRef.current = new Set();
    setStudentNameById({});

    let cancelled = false;

    const load = async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setHistoryLoading(true);
      try {
        const [tal, drives] = await Promise.all([
          fetchTalonHistoryForUser(instructorUid),
          fetchDriveSlotsForInstructor(instructorUid),
        ]);
        if (cancelled) return;
        setEntries(tal);
        setDriveSlots(drives);
        setErr(null);
        setDriveErr(null);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg =
          e instanceof Error ? e.message : "Не удалось загрузить историю";
        setErr(msg);
        setDriveErr(msg);
      } finally {
        if (!cancelled && !opts?.silent) setHistoryLoading(false);
      }
    };

    void load();

    const onVis = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      void load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [instructorUid]);

  const historyStudentIdsKey = useMemo(
    () =>
      [...new Set(driveHistorySlots.map((s) => s.studentId).filter(Boolean))]
        .sort()
        .join("|"),
    [driveHistorySlots]
  );

  useEffect(() => {
    if (!historyStudentIdsKey) return;
    const ids = historyStudentIdsKey.split("|").filter(Boolean);
    const missing = ids.filter((id) => !loadedStudentIdsRef.current.has(id));
    if (missing.length === 0) return;

    let cancelled = false;
    void (async () => {
      const results = await Promise.all(
        missing.map(async (id) => {
          try {
            const p = await getUserProfile(id);
            return [id, p?.displayName?.trim() ?? ""] as const;
          } catch {
            return [id, ""] as const;
          }
        })
      );
      if (cancelled) return;
      for (const [id] of results) {
        loadedStudentIdsRef.current.add(id);
      }
      setStudentNameById((prev) => {
        const next = { ...prev };
        for (const [id, name] of results) {
          next[id] = name;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [historyStudentIdsKey]);

  return (
    <div className="admin-tab instructor-history-tab">
      <h1 className="admin-tab-title">История</h1>
      {historyLoading && !err && !driveErr ? (
        <p className="instructor-history-loading-hint" aria-live="polite">
          Загрузка…
        </p>
      ) : null}
      {err ? (
        <div className="form-error" role="alert">
          {err}
        </div>
      ) : null}
      {driveErr ? (
        <div className="form-error" role="alert">
          {driveErr}
        </div>
      ) : null}

      <section className="admin-history-section instructor-history-talon-section" aria-labelledby="instr-history-talon-heading">
        <button
          type="button"
          id="instr-history-talon-heading"
          className="instructor-home-section-toggle glossy-panel instructor-history-talon-toggle"
          aria-expanded={talonSectionOpen}
          aria-controls="instr-history-talon-panel"
          onClick={() => setTalonSectionOpen((o) => !o)}
        >
          <span className="instructor-history-talon-toggle-title">
            <IconTalonBalance />
            <span className="instructor-home-section-toggle-label">Баланс талонов</span>
          </span>
          <span className="instructor-home-section-toggle-meta">{talonBalanceRows.length}</span>
          <IconChevron open={talonSectionOpen} />
        </button>
        <div
          id="instr-history-talon-panel"
          className="instructor-history-talon-panel"
          hidden={!talonSectionOpen}
        >
          {talonBalanceSynthOnly ? (
            <p className="instructor-history-talon-synth-hint">
              Записей в журнале нет; ниже — зачисления по завершённым вождениям из графика. Новые завершения
              также сохраняются в журнале автоматически.
            </p>
          ) : null}
          <div className="admin-schedule-table-wrap admin-history-table-wrap">
            <table className="admin-schedule-table admin-history-table instructor-history-talon-table">
              <thead>
                <tr>
                  <th>Дата и время</th>
                  <th>Статус</th>
                  <th className="instructor-history-talon-th-count">
                    Кол-во
                    <br />
                    талонов
                  </th>
                  <th>Кем</th>
                </tr>
              </thead>
              <tbody>
                {talonBalanceRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-schedule-table-empty">
                      Записей пока нет. Движения талонов появляются при завершении вождения и при изменении
                      баланса администратором.
                    </td>
                  </tr>
                ) : (
                  talonBalanceRows.map((e) => {
                    const credited = e.delta > 0;
                    const amount = Math.abs(e.delta);
                    const hasFrom = Boolean(e.fromUid && e.fromRole);
                    const fromCell = hasFrom
                      ? `${partyFromRoleLabel(e.fromRole!)} / ${formatShortFio(e.fromDisplayName ?? "")}`
                      : "—";
                    return (
                      <tr key={e.id}>
                        <td>{formatRuDateTime(e.at)}</td>
                        <td className={credited ? "instr-talon-hist--credit" : "instr-talon-hist--debit"}>
                          {credited ? "Зачислено" : "Списано"}
                        </td>
                        <td>{amount}</td>
                        <td>{fromCell}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="admin-history-section instructor-history-drive-section" aria-labelledby="instr-history-drive-heading">
        <button
          type="button"
          id="instr-history-drive-heading"
          className="instructor-home-section-toggle glossy-panel instructor-history-drive-toggle"
          aria-expanded={driveSectionOpen}
          aria-controls="instr-history-drive-panel"
          onClick={() => setDriveSectionOpen((o) => !o)}
        >
          <span className="instructor-history-drive-toggle-title">
            <IconDrive />
            <span className="instructor-home-section-toggle-label">Вождение</span>
          </span>
          <span className="instructor-home-section-toggle-meta">{driveHistorySlots.length}</span>
          <IconChevron open={driveSectionOpen} />
        </button>
        <div
          id="instr-history-drive-panel"
          className="instructor-history-drive-panel"
          hidden={!driveSectionOpen}
        >
          <div className="admin-schedule-table-wrap admin-history-table-wrap">
            <table className="admin-schedule-table admin-history-table instructor-history-drive-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th className="instructor-history-drive-th-time">
                    Время
                    <br />
                    начала
                  </th>
                  <th className="instructor-history-drive-th-cadet">
                    Фамилия И.О.
                    <br />
                    курсанта
                  </th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {driveHistorySlots.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-schedule-table-empty">
                      Завершённых и отменённых записей пока нет.
                    </td>
                  </tr>
                ) : (
                  driveHistorySlots.map((slot) => {
                    const rawName =
                      slot.studentDisplayName.trim() ||
                      (studentNameById[slot.studentId] ?? "").trim();
                    const cadetCell = rawName ? formatShortFio(rawName) : "—";
                    const { lines } = driveHistoryStatusLines(slot);
                    return (
                      <tr key={slot.id}>
                        <td>{driveHistoryTableDateCell(slot)}</td>
                        <td>
                          {isDriveStartedBeforeScheduled(slot) && slot.liveStartedAt != null ? (
                            <span className="instructor-history-drive-time-cell">
                              <span className="instructor-history-drive-time-main">
                                {formatMsLocalHHmm(slot.liveStartedAt)}
                              </span>
                              <span className="instructor-history-drive-time-planned">
                                по графику: {slot.startTime || "—"}
                              </span>
                            </span>
                          ) : (
                            slot.startTime || "—"
                          )}
                        </td>
                        <td>{cadetCell}</td>
                        <td className="instructor-history-drive-status-cell">
                          <div className="instructor-history-drive-status-stack">
                            {lines.map((line, i) => (
                              <span key={i}>{line}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
