import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatShortFio } from "@/admin/formatShortFio";
import { useAuth } from "@/context/AuthContext";
import { subscribeTalonHistoryForUser, type TalonHistoryEntry } from "@/firebase/history";
import type { UserRole } from "@/types";
import { IconCabinetOps, IconCabinetTalon } from "@/components/student/studentCabinetSectionIcons";

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg className={`instr-chevron${open ? " is-open" : ""}`} viewBox="0 0 24 24" aria-hidden>
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

function formatRuDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function formatRuTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function operationLabel(e: TalonHistoryEntry): string {
  const credited = e.delta > 0;
  const amount = Math.abs(e.delta);
  const suffix = e.talonKind === "exam" ? " (экзамен)" : "";
  return credited ? `Зачислено${suffix}: ${amount}` : `Списано${suffix}: ${amount}`;
}

function whoCell(e: TalonHistoryEntry): string {
  const hasFrom = Boolean(e.fromUid && e.fromRole);
  if (!hasFrom) return "—";
  return `${partyFromRoleLabel(e.fromRole!)} · ${formatShortFio(e.fromDisplayName ?? "")}`;
}

/**
 * Компактный блок баланса талонов в ЛК: заголовок + круг; «Последние операции» по умолчанию свёрнуты.
 */
export function StudentCabinetTalonBalance() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const uid = (user?.uid ?? profile?.uid ?? "").trim();
  const drivingTalons = profile?.talons ?? 0;
  const examTalons = profile?.examTalons ?? 0;
  const [entries, setEntries] = useState<TalonHistoryEntry[]>([]);
  const [opsOpen, setOpsOpen] = useState(false);

  useEffect(() => {
    if (!uid) {
      setEntries([]);
      return;
    }
    return subscribeTalonHistoryForUser(uid, setEntries, () => setEntries([]));
  }, [uid]);

  const lastThree = useMemo(() => entries.slice(0, 3), [entries]);

  const goHistoryBalance = useCallback(() => {
    navigate("..", {
      state: { studentTab: "history" as const, focusHistoryBalance: true },
    });
  }, [navigate]);

  return (
    <section className="student-cabinet-card student-cabinet-talon-brief" aria-labelledby="cabinet-talon-title">
      <div className="student-cabinet-talon-head">
        <div className="student-cabinet-talon-head-main">
          <h2
            id="cabinet-talon-title"
            className="student-cabinet-talon-head-title student-cab-title-with-ico"
          >
            <IconCabinetTalon />
            <span>Баланс талонов</span>
          </h2>
          <div className="student-cabinet-talon-head-lines">
            <div>Талоны (вождений): {drivingTalons}</div>
            <div>Талоны (экзамен): {examTalons}</div>
          </div>
        </div>
        <div
          className="student-cabinet-talon-head-values"
          aria-label={`Талоны: вождений ${drivingTalons}, экзамен ${examTalons}`}
        >
          <span
            className={`student-cabinet-talon-disc${drivingTalons > 0 ? " is-positive" : " is-zero"}`}
            aria-hidden
          >
            {drivingTalons}
          </span>
          <span
            className={`student-cabinet-talon-disc${examTalons > 0 ? " is-exam" : " is-zero"}`}
            aria-hidden
          >
            {examTalons}
          </span>
        </div>
      </div>

      <button
        type="button"
        className="instructor-home-section-toggle glossy-panel student-cab-collapse-toggle student-cab-collapse-toggle--talon-ops"
        aria-expanded={opsOpen}
        aria-controls="cabinet-talon-ops-panel"
        onClick={() => setOpsOpen((v) => !v)}
      >
        <span className="student-cab-toggle-label-inner">
          <IconCabinetOps />
          <span className="instructor-home-section-toggle-label">Последние операции</span>
        </span>
        <span className="instructor-home-section-toggle-meta">{lastThree.length}</span>
        <IconChevron open={opsOpen} />
      </button>
      <div id="cabinet-talon-ops-panel" className="student-cab-collapse-panel" hidden={!opsOpen}>
        <div className="student-cabinet-talon-table-wrap">
          <table className="student-cabinet-talon-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Время</th>
                <th>Операция</th>
                <th>Кем</th>
              </tr>
            </thead>
            <tbody>
              {lastThree.length === 0 ? (
                <tr>
                  <td colSpan={4} className="student-cabinet-talon-table-empty">
                    Нет записей в журнале
                  </td>
                </tr>
              ) : (
                lastThree.map((e) => (
                  <tr key={e.id}>
                    <td>{formatRuDate(e.at)}</td>
                    <td>{formatRuTime(e.at)}</td>
                    <td
                      className={
                        e.delta > 0
                          ? "student-cabinet-talon-table-op student-cabinet-talon-table-op--in"
                          : "student-cabinet-talon-table-op student-cabinet-talon-table-op--out"
                      }
                    >
                      {operationLabel(e)}
                    </td>
                    <td className="student-cabinet-talon-table-who">{whoCell(e)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <button type="button" className="student-cabinet-text-link" onClick={goHistoryBalance}>
          Подробнее
        </button>
      </div>
    </section>
  );
}
