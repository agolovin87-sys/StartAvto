import { useMemo, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import type { TalonHistoryEntry } from "@/firebase/history";
import type { DriveSlot, UserRole } from "@/types";

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

const roleLabel: Record<UserRole, string> = {
  admin: "Администратор",
  instructor: "Инструктор",
  student: "Курсант",
};

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

function driveSlotTalonAnchorMs(slot: DriveSlot): number {
  if (slot.liveEndedAt != null) return slot.liveEndedAt;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(slot.dateKey.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(slot.startTime.trim() || "12:00");
  if (!m) return slot.createdAt;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const hh = tm ? Number(tm[1]) : 12;
  const min = tm ? Number(tm[2]) : 0;
  return new Date(y, mo - 1, day, hh, min).getTime();
}

function completedDriveToSyntheticStudentTalonEntry(
  studentUid: string,
  studentDisplayName: string,
  slot: DriveSlot,
  instructorDisplayName: string
): TalonHistoryEntry {
  return {
    id: `synth-drive-${slot.id}`,
    at: driveSlotTalonAnchorMs(slot),
    targetUid: studentUid,
    targetRole: "student",
    targetDisplayName: studentDisplayName,
    delta: -1,
    previousTalons: 0,
    newTalons: 0,
    fromUid: slot.instructorId,
    fromRole: "instructor",
    fromDisplayName: instructorDisplayName,
  };
}

type StudentTalonBalanceSectionProps = {
  studentUid: string;
  studentDisplayName: string;
  entries: TalonHistoryEntry[];
  driveSlots: DriveSlot[];
  instructorNameById: Record<string, string>;
};

export function StudentTalonBalanceSection({
  studentUid,
  studentDisplayName,
  entries,
  driveSlots,
  instructorNameById,
}: StudentTalonBalanceSectionProps) {
  const [talonSectionOpen, setTalonSectionOpen] = useState(false);

  const completedDrives = useMemo(
    () => driveSlots.filter((s) => s.status === "completed"),
    [driveSlots]
  );

  const talonBalanceRows = useMemo(() => {
    if (entries.length > 0) {
      return [...entries].sort((a, b) => b.at - a.at);
    }
    return completedDrives
      .map((s) =>
        completedDriveToSyntheticStudentTalonEntry(
          studentUid,
          studentDisplayName,
          s,
          instructorNameById[s.instructorId] ?? ""
        )
      )
      .sort((a, b) => b.at - a.at);
  }, [entries, completedDrives, studentUid, studentDisplayName, instructorNameById]);

  const talonBalanceSynthOnly =
    entries.length === 0 && completedDrives.length > 0 && talonBalanceRows.length > 0;

  const tableBlock = (
    <>
      {talonBalanceSynthOnly ? (
        <p className="instructor-history-talon-synth-hint">
          Записей в журнале нет; ниже — списания по завершённым вождениям из графика. Новые операции также
          сохраняются в журнале автоматически.
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
                  Записей пока нет. Движения талонов появляются при завершении вождения и при изменении баланса
                  администратором.
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
    </>
  );

  return (
    <section
      className="admin-history-section instructor-history-talon-section"
      aria-labelledby="student-history-talon-heading"
    >
      <button
        type="button"
        id="student-history-talon-heading"
        className="instructor-home-section-toggle glossy-panel instructor-history-talon-toggle"
        aria-expanded={talonSectionOpen}
        aria-controls="student-history-talon-panel"
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
        id="student-history-talon-panel"
        className="instructor-history-talon-panel"
        hidden={!talonSectionOpen}
      >
        {tableBlock}
      </div>
    </section>
  );
}
