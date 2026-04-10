import { useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import {
  driveHistoryTableDateCell,
  formatMsLocalHHmm,
  isDriveStartedBeforeScheduled,
} from "@/admin/scheduleFormat";
import { useAuth } from "@/context/AuthContext";
import { StudentTalonBalanceSection } from "@/pages/dashboards/student/StudentTalonBalanceSection";
import { useStudentHistoryData } from "@/pages/dashboards/student/useStudentHistoryData";
import type { DriveSlot } from "@/types";

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

export function StudentHistoryTab() {
  const { user, profile } = useAuth();
  const studentUid = (user?.uid ?? profile?.uid ?? "").trim();
  const {
    entries,
    driveSlots,
    driveHistorySlots,
    err,
    loading: historyLoading,
    instructorNameById,
  } = useStudentHistoryData(studentUid);

  const [driveSectionOpen, setDriveSectionOpen] = useState(false);

  const studentDisplayName = profile?.displayName?.trim() ?? "";

  return (
    <div className="admin-tab instructor-history-tab">
      <h1 className="admin-tab-title">История</h1>
      {historyLoading && !err ? (
        <p className="instructor-history-loading-hint" aria-live="polite">
          Загрузка…
        </p>
      ) : null}
      {err ? (
        <div className="form-error" role="alert">
          {err}
        </div>
      ) : null}

      <StudentTalonBalanceSection
        studentUid={studentUid}
        studentDisplayName={studentDisplayName}
        entries={entries}
        driveSlots={driveSlots}
        instructorNameById={instructorNameById}
      />

      <section
        className="admin-history-section instructor-history-drive-section"
        aria-labelledby="student-history-drive-heading"
      >
        <button
          type="button"
          id="student-history-drive-heading"
          className="instructor-home-section-toggle glossy-panel instructor-history-drive-toggle"
          aria-expanded={driveSectionOpen}
          aria-controls="student-history-drive-panel"
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
          id="student-history-drive-panel"
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
                    инструктора
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
                      instructorNameById[slot.instructorId]?.trim() ?? "";
                    const instructorCell = rawName ? formatShortFio(rawName) : "—";
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
                        <td>{instructorCell}</td>
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
