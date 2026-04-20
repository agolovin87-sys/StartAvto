import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatShortFio } from "@/admin/formatShortFio";
import { useAuth } from "@/context/AuthContext";
import { subscribeTalonHistoryForUser, type TalonHistoryEntry } from "@/firebase/history";
import type { UserRole } from "@/types";
import {
  IconInstructorCabinetOps,
  IconInstructorCabinetTalon,
} from "@/components/instructor/instructorCabinetSectionIcons";

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
  return credited ? `Зачислено: ${amount}` : `Списано: ${amount}`;
}

function whoCell(e: TalonHistoryEntry): string {
  const hasFrom = Boolean(e.fromUid && e.fromRole);
  if (!hasFrom) return "—";
  return `${partyFromRoleLabel(e.fromRole!)} · ${formatShortFio(e.fromDisplayName ?? "")}`;
}

/**
 * Блок баланса талонов в ЛК инструктора (как у курсанта: шапка, круг, последние операции).
 */
export function InstructorCabinetTalonSection() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const uid = (user?.uid ?? profile?.uid ?? "").trim();
  const balance = profile?.talons ?? 0;
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

  const goHistory = useCallback(() => {
    navigate("..", { state: { instructorTab: "history" as const } });
  }, [navigate]);

  return (
    <section
      className="student-cabinet-card student-cabinet-talon-brief instructor-cabinet-block-surface"
      aria-labelledby="instructor-cabinet-talon-title"
    >
      <div className="student-cabinet-talon-head">
        <h2
          id="instructor-cabinet-talon-title"
          className="student-cabinet-talon-head-title student-cab-title-with-ico"
        >
          <IconInstructorCabinetTalon className="instructor-cab-section-ico" />
          <span>Баланс талонов</span>
        </h2>
        <div className="student-cabinet-talon-head-values" aria-label={`Талонов на счёте: ${balance}`}>
          <span
            className={`student-cabinet-talon-disc${balance > 0 ? " is-positive" : balance < 1 ? " is-zero" : ""}`}
            aria-hidden
          >
            {balance}
          </span>
        </div>
      </div>

      <button
        type="button"
        className="instructor-home-section-toggle glossy-panel student-cab-collapse-toggle student-cab-collapse-toggle--talon-ops"
        aria-expanded={opsOpen}
        aria-controls="instructor-cabinet-talon-ops-panel"
        onClick={() => setOpsOpen((v) => !v)}
      >
        <span className="student-cab-toggle-label-inner">
          <IconInstructorCabinetOps className="instructor-cab-section-ico" />
          <span className="instructor-home-section-toggle-label">Последние операции</span>
        </span>
        <span className="instructor-home-section-toggle-meta">{lastThree.length}</span>
        <IconChevron open={opsOpen} />
      </button>
      <div id="instructor-cabinet-talon-ops-panel" className="student-cab-collapse-panel" hidden={!opsOpen}>
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
        <button type="button" className="student-cabinet-text-link" onClick={goHistory}>
          Подробнее в «Истории»
        </button>
      </div>
    </section>
  );
}
