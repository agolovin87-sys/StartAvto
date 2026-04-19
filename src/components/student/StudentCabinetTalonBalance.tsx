import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatShortFio } from "@/admin/formatShortFio";
import { useAuth } from "@/context/AuthContext";
import { subscribeTalonHistoryForUser, type TalonHistoryEntry } from "@/firebase/history";
import type { UserRole } from "@/types";

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

/**
 * Краткий блок баланса талонов в ЛК: текущий остаток, три последние операции из журнала, ссылка в «Историю».
 */
export function StudentCabinetTalonBalance() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const uid = (user?.uid ?? profile?.uid ?? "").trim();
  const balance = profile?.talons ?? 0;
  const [entries, setEntries] = useState<TalonHistoryEntry[]>([]);

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
      <h2 id="cabinet-talon-title" className="student-cabinet-card__title">
        Баланс талонов
      </h2>
      <p className="student-cabinet-talon-balance-big" aria-live="polite">
        {balance}
      </p>
      <p className="field-hint student-cabinet-talon-balance-caption">Талонов на счёте</p>

      <h3 className="student-cabinet-subtitle">Последние операции</h3>
      {lastThree.length === 0 ? (
        <p className="field-hint">В журнале пока нет записей — движения появятся при изменении баланса.</p>
      ) : (
        <ul className="student-cabinet-talon-ops">
          {lastThree.map((e) => {
            const credited = e.delta > 0;
            const amount = Math.abs(e.delta);
            const hasFrom = Boolean(e.fromUid && e.fromRole);
            const fromLine = hasFrom
              ? `${partyFromRoleLabel(e.fromRole!)} · ${formatShortFio(e.fromDisplayName ?? "")}`
              : "—";
            return (
              <li key={e.id} className="student-cabinet-talon-op">
                <span className="student-cabinet-talon-op-date">{formatRuDateTime(e.at)}</span>
                <span className="student-cabinet-talon-op-main">
                  <span className={credited ? "student-cabinet-talon--credit" : "student-cabinet-talon--debit"}>
                    {credited ? "Зачислено" : "Списано"}: {amount}
                  </span>
                  <span className="student-cabinet-talon-op-from">{fromLine}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className="student-cabinet-text-link" onClick={goHistoryBalance}>
        Подробнее
      </button>
    </section>
  );
}
