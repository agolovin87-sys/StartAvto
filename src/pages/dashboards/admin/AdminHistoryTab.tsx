import { useEffect, useMemo, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import { useAuth } from "@/context/AuthContext";
import { subscribeAllUsersAdmin } from "@/firebase/admin";
import {
  deleteAllTalonHistory,
  subscribeTalonHistory,
  type TalonHistoryEntry,
} from "@/firebase/history";
import type { UserProfile, UserRole } from "@/types";

const roleLabel: Record<UserRole, string> = {
  admin: "Администратор",
  instructor: "Инструктор",
  student: "Курсант",
};

function formatRuDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function formatRuTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type UserHistoryRow = {
  at: number;
  event: "Регистрация" | "Удаление";
  role: UserRole;
  displayName: string;
};

function buildUserHistoryRows(users: UserProfile[]): UserHistoryRow[] {
  const rows: UserHistoryRow[] = [];
  for (const u of users) {
    rows.push({
      at: u.createdAt,
      event: "Регистрация",
      role: u.role,
      displayName: u.displayName,
    });
    if (u.accountStatus === "rejected" && u.rejectedAt != null) {
      rows.push({
        at: u.rejectedAt,
        event: "Удаление",
        role: u.role,
        displayName: u.displayName,
      });
    }
  }
  rows.sort((a, b) => b.at - a.at);
  return rows;
}

function IconClearHistory({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4zM8 9h2v9H8V9zm4 0h2v9h-2V9zm4 0h2v9h-2V9z"
      />
    </svg>
  );
}

export function AdminHistoryTab() {
  const { user, loading: authLoading } = useAuth();
  const [talonEntries, setTalonEntries] = useState<TalonHistoryEntry[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [clearTalonConfirm, setClearTalonConfirm] = useState(false);
  const [clearTalonBusy, setClearTalonBusy] = useState(false);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    setErr(null);
    const unsubT = subscribeTalonHistory(setTalonEntries, (e) => setErr(e.message));
    const unsubU = subscribeAllUsersAdmin(setUsers, (e) => setErr(e.message));
    return () => {
      unsubT();
      unsubU();
    };
  }, [authLoading, user]);

  const userRows = useMemo(() => buildUserHistoryRows(users), [users]);

  async function confirmClearTalonHistory() {
    setClearTalonBusy(true);
    setErr(null);
    try {
      await deleteAllTalonHistory();
      setClearTalonConfirm(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Не удалось очистить историю");
    } finally {
      setClearTalonBusy(false);
    }
  }

  return (
    <div className="admin-tab">
      <h1 className="admin-tab-title">История</h1>
      {err ? (
        <div className="form-error" role="alert">
          {err}
        </div>
      ) : null}

      <section className="admin-history-section" aria-labelledby="history-talon-heading">
        <div className="admin-history-section-head">
          <h2 className="admin-history-section-title" id="history-talon-heading">
            Баланс талонов
          </h2>
          {clearTalonConfirm ? (
            <div
              className="admin-history-clear-confirm"
              role="group"
              aria-label="Подтверждение очистки истории талонов"
            >
              <span className="admin-history-clear-question">Вы уверены?</span>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={clearTalonBusy}
                onClick={() => void confirmClearTalonHistory()}
              >
                {clearTalonBusy ? "…" : "Да"}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={clearTalonBusy}
                onClick={() => setClearTalonConfirm(false)}
              >
                Нет
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="admin-history-clear-btn glossy-btn"
              title="Очистить историю баланса талонов"
              aria-label="Очистить историю баланса талонов"
              disabled={talonEntries.length === 0 || clearTalonBusy}
              onClick={() => setClearTalonConfirm(true)}
            >
              <IconClearHistory className="admin-history-clear-icon" />
            </button>
          )}
        </div>
        <div className="admin-schedule-table-wrap admin-history-table-wrap">
          <table className="admin-schedule-table admin-history-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Время</th>
                <th>Списание / зачисление</th>
                <th>Роль</th>
                <th>Фамилия И.О.</th>
                <th>Кем</th>
              </tr>
            </thead>
            <tbody>
              {talonEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-schedule-table-empty">
                    Записей пока нет. Списание и зачисление талонов фиксируются при сохранении в карточках
                    курсантов и инструкторов.
                  </td>
                </tr>
              ) : (
                talonEntries.map((e) => {
                  const op =
                    e.delta > 0
                      ? `Зачисление +${e.delta}`
                      : e.delta < 0
                        ? `Списание ${Math.abs(e.delta)}`
                        : "—";
                  const fromParty =
                    e.fromUid && e.fromRole
                      ? `${e.fromRole === "admin" ? "Админ" : roleLabel[e.fromRole]} / ${formatShortFio(e.fromDisplayName ?? "")}`
                      : "—";
                  return (
                    <tr key={e.id}>
                      <td>{formatRuDate(e.at)}</td>
                      <td>{formatRuTime(e.at)}</td>
                      <td>{op}</td>
                      <td>{roleLabel[e.targetRole]}</td>
                      <td>{formatShortFio(e.targetDisplayName)}</td>
                      <td>{fromParty}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-history-section" aria-labelledby="history-users-heading">
        <h2 className="admin-history-section-title" id="history-users-heading">
          Пользователи
        </h2>
        <div className="admin-schedule-table-wrap admin-history-table-wrap">
          <table className="admin-schedule-table admin-history-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Время</th>
                <th>Событие</th>
                <th>Роль</th>
                <th>Фамилия И.О.</th>
              </tr>
            </thead>
            <tbody>
              {userRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-schedule-table-empty">
                    Нет данных.
                  </td>
                </tr>
              ) : (
                userRows.map((r, i) => (
                  <tr key={`${r.event}-${r.at}-${i}`}>
                    <td>{formatRuDate(r.at)}</td>
                    <td>{formatRuTime(r.at)}</td>
                    <td>{r.event}</td>
                    <td>{roleLabel[r.role]}</td>
                    <td>{formatShortFio(r.displayName)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
