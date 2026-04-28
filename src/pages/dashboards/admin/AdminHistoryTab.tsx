import { useEffect, useMemo, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import { useAuth } from "@/context/AuthContext";
import { AuditLogPanel } from "@/pages/admin/AuditLog";
import { subscribeAllUsersAdmin, subscribeTrainingGroups } from "@/firebase/admin";
import {
  deleteAllTalonHistory,
  deleteTalonHistoryEntriesByIds,
  subscribeTalonHistory,
  type TalonHistoryEntry,
} from "@/firebase/history";
import type { TrainingGroup, UserProfile, UserRole } from "@/types";

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

function groupStudentsForPicker(
  students: UserProfile[],
  groupNameById: Map<string, string>
): Array<{ id: string; title: string; users: UserProfile[] }> {
  const buckets = new Map<string, { title: string; users: UserProfile[] }>();
  for (const s of students) {
    const gid = (s.groupId ?? "").trim() || "__no_group__";
    const title =
      gid === "__no_group__" ? "Без группы" : groupNameById.get(gid) || "Группа";
    if (!buckets.has(gid)) buckets.set(gid, { title, users: [] });
    buckets.get(gid)?.users.push(s);
  }
  const out = [...buckets.entries()].map(([id, v]) => ({
    id,
    title: v.title,
    users: v.users.slice().sort((a, b) => a.displayName.localeCompare(b.displayName, "ru")),
  }));
  out.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  return out;
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

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg className={`instr-chevron${open ? " is-open" : ""}`} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M7 10l5 5 5-5z" />
    </svg>
  );
}

export function AdminHistoryTab() {
  const { user, loading: authLoading } = useAuth();
  const [talonEntries, setTalonEntries] = useState<TalonHistoryEntry[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [trainingGroups, setTrainingGroups] = useState<TrainingGroup[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [clearTalonConfirm, setClearTalonConfirm] = useState(false);
  const [clearTalonBusy, setClearTalonBusy] = useState(false);
  const [talonFioFilter, setTalonFioFilter] = useState("");
  const [talonSelectionMode, setTalonSelectionMode] = useState(false);
  const [selectedTalonEntryIds, setSelectedTalonEntryIds] = useState<string[]>([]);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [pickedUserUid, setPickedUserUid] = useState<string>("");

  const [talonOpen, setTalonOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    setErr(null);
    const unsubT = subscribeTalonHistory(setTalonEntries, (e) => setErr(e.message));
    const unsubU = subscribeAllUsersAdmin(setUsers, (e) => setErr(e.message));
    const unsubG = subscribeTrainingGroups(setTrainingGroups, (e) => setErr(e.message));
    return () => {
      unsubT();
      unsubU();
      unsubG();
    };
  }, [authLoading, user]);

  const userRows = useMemo(() => buildUserHistoryRows(users), [users]);

  /** Только правки баланса администратором из карточек; без списаний за вождение (инструктор → курсант). */
  const adminTalonEntries = useMemo(
    () => talonEntries.filter((e) => !e.fromRole || e.fromRole === "admin"),
    [talonEntries]
  );
  const talonFioFilterNorm = talonFioFilter.trim().toLowerCase();
  const filteredAdminTalonEntries = useMemo(() => {
    if (!talonFioFilterNorm) return adminTalonEntries;
    return adminTalonEntries.filter((e) => {
      const full = (e.targetDisplayName ?? "").trim().toLowerCase();
      const short = formatShortFio(e.targetDisplayName ?? "").toLowerCase();
      return full.includes(talonFioFilterNorm) || short.includes(talonFioFilterNorm);
    });
  }, [adminTalonEntries, talonFioFilterNorm]);
  const selectedTalonIdSet = useMemo(() => new Set(selectedTalonEntryIds), [selectedTalonEntryIds]);
  const allFilteredSelected =
    filteredAdminTalonEntries.length > 0 &&
    filteredAdminTalonEntries.every((e) => selectedTalonIdSet.has(e.id));
  const someFilteredSelected =
    filteredAdminTalonEntries.some((e) => selectedTalonIdSet.has(e.id)) && !allFilteredSelected;

  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of trainingGroups) {
      const id = (g.id ?? "").trim();
      if (!id) continue;
      m.set(id, (g.name ?? "").trim() || "Группа");
    }
    return m;
  }, [trainingGroups]);
  const activeUsersForPicker = useMemo(
    () => users.filter((u) => u.accountStatus !== "rejected"),
    [users]
  );
  const instructorUsers = useMemo(
    () =>
      activeUsersForPicker
        .filter((u) => u.role === "instructor")
        .slice()
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "ru")),
    [activeUsersForPicker]
  );
  const studentGroupsForPicker = useMemo(
    () =>
      groupStudentsForPicker(
        activeUsersForPicker.filter((u) => u.role === "student"),
        groupNameById
      ),
    [activeUsersForPicker, groupNameById]
  );
  const pickedUser = useMemo(
    () => activeUsersForPicker.find((u) => u.uid === pickedUserUid) ?? null,
    [activeUsersForPicker, pickedUserUid]
  );
  const pickedUserEntries = useMemo(
    () => (pickedUserUid ? talonEntries.filter((e) => e.targetUid === pickedUserUid) : []),
    [talonEntries, pickedUserUid]
  );
  const pickedUserDrivingBalance =
    pickedUser?.talons ??
    (pickedUserEntries.length > 0 ? pickedUserEntries[0]?.newTalons ?? 0 : 0);

  function toggleRowSelected(entryId: string) {
    const id = entryId.trim();
    if (!id) return;
    setSelectedTalonEntryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAllFilteredRows() {
    setSelectedTalonEntryIds((prev) => {
      const prevSet = new Set(prev);
      if (allFilteredSelected) {
        for (const e of filteredAdminTalonEntries) prevSet.delete(e.id);
      } else {
        for (const e of filteredAdminTalonEntries) prevSet.add(e.id);
      }
      return [...prevSet];
    });
  }

  async function deleteSelectedTalonEntries() {
    if (selectedTalonEntryIds.length === 0) return;
    if (!confirm(`Удалить выбранные записи: ${selectedTalonEntryIds.length} шт.?`)) return;
    setClearTalonBusy(true);
    setErr(null);
    try {
      await deleteTalonHistoryEntriesByIds(selectedTalonEntryIds);
      setSelectedTalonEntryIds([]);
      setTalonSelectionMode(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Не удалось удалить выбранные записи");
    } finally {
      setClearTalonBusy(false);
    }
  }

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
        <button
          type="button"
          id="history-talon-heading"
          className="instructor-home-section-toggle glossy-panel admin-history-collapse-toggle"
          aria-expanded={talonOpen}
          aria-controls="history-talon-panel"
          onClick={() => setTalonOpen((o) => !o)}
        >
          <span className="instructor-home-section-toggle-label">Баланс талонов</span>
          <span className="instructor-home-section-toggle-meta">{adminTalonEntries.length}</span>
          <IconChevron open={talonOpen} />
        </button>
        <div
          id="history-talon-panel"
          className="admin-history-collapse-panel"
          hidden={!talonOpen}
        >
          <div className="admin-history-section-head">
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
              <div className="admin-history-head-actions">
                <button
                  type="button"
                  className="admin-history-clear-btn glossy-btn"
                  title={
                    talonSelectionMode
                      ? "Отменить выбор записей"
                      : "Выбрать записи для удаления"
                  }
                  aria-label={
                    talonSelectionMode
                      ? "Отменить выбор записей"
                      : "Выбрать записи для удаления"
                  }
                  disabled={talonEntries.length === 0 || clearTalonBusy}
                  onClick={() => {
                    setClearTalonConfirm(false);
                    setTalonSelectionMode((v) => !v);
                    if (talonSelectionMode) setSelectedTalonEntryIds([]);
                  }}
                >
                  <IconClearHistory className="admin-history-clear-icon" />
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setUserPickerOpen((v) => !v)}
                >
                  Выбрать пользователя
                </button>
                {talonSelectionMode ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={selectedTalonEntryIds.length === 0 || clearTalonBusy}
                    onClick={() => void deleteSelectedTalonEntries()}
                  >
                    Удалить выбранные ({selectedTalonEntryIds.length})
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={talonEntries.length === 0 || clearTalonBusy || talonSelectionMode}
                  onClick={() => setClearTalonConfirm(true)}
                >
                  Очистить все
                </button>
              </div>
            )}
          </div>
          {userPickerOpen ? (
            <div className="modal-backdrop" onClick={() => setUserPickerOpen(false)}>
              <div
                className="admin-history-user-picker-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Выбор пользователя для истории талонов"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="admin-history-user-picker-modal-head">
                  <strong>Выберите пользователя</strong>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setUserPickerOpen(false)}
                  >
                    Закрыть
                  </button>
                </div>
                <div className="admin-history-user-picker">
                  <div className="admin-history-user-picker-col">
                    <div className="chat-contacts-section-subtitle">Инструкторы</div>
                    <ul className="admin-history-user-picker-list">
                      {instructorUsers.map((u) => (
                        <li key={u.uid}>
                          <button
                            type="button"
                            className={pickedUserUid === u.uid ? "admin-history-user-pick-btn is-active" : "admin-history-user-pick-btn"}
                            onClick={() => {
                              setPickedUserUid(u.uid);
                              setUserPickerOpen(false);
                            }}
                          >
                            {formatShortFio(u.displayName)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="admin-history-user-picker-col">
                    <div className="chat-contacts-section-subtitle">Курсанты (по группам)</div>
                    {studentGroupsForPicker.map((g) => (
                      <div key={g.id} className="admin-history-user-picker-group">
                        <div className="admin-history-user-picker-group-title">{g.title}</div>
                        <ul className="admin-history-user-picker-list">
                          {g.users.map((u) => (
                            <li key={u.uid}>
                              <button
                                type="button"
                                className={pickedUserUid === u.uid ? "admin-history-user-pick-btn is-active" : "admin-history-user-pick-btn"}
                                onClick={() => {
                                  setPickedUserUid(u.uid);
                                  setUserPickerOpen(false);
                                }}
                              >
                                {formatShortFio(u.displayName)}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {pickedUser ? (
            <div className="admin-history-user-focus">
              <div className="admin-history-user-focus-head">
                <strong>{formatShortFio(pickedUser.displayName)}</strong>
                <span>{roleLabel[pickedUser.role]}</span>
                <span>Общее количество талонов: {pickedUserDrivingBalance}</span>
              </div>
              <div className="admin-schedule-table-wrap admin-history-table-wrap">
                <table className="admin-schedule-table admin-history-table">
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Время</th>
                      <th>Зачисление</th>
                      <th>Списание</th>
                      <th>Кому</th>
                      <th>От кого</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickedUserEntries.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="admin-schedule-table-empty">Нет записей по пользователю.</td>
                      </tr>
                    ) : (
                      pickedUserEntries.map((e) => (
                        <tr key={`picked-${e.id}`}>
                          <td>{formatRuDate(e.at)}</td>
                          <td>{formatRuTime(e.at)}</td>
                          <td>{e.delta > 0 ? `+${e.delta}` : "—"}</td>
                          <td>{e.delta < 0 ? `-${Math.abs(e.delta)}` : "—"}</td>
                          <td>{formatShortFio(e.targetDisplayName)}</td>
                          <td>
                            {e.fromUid && e.fromRole
                              ? `${e.fromRole === "admin" ? "Админ" : roleLabel[e.fromRole]} / ${formatShortFio(e.fromDisplayName ?? "")}`
                              : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className="admin-history-filter-row">
            <input
              type="text"
              className="input admin-history-filter-input"
              value={talonFioFilter}
              onChange={(e) => setTalonFioFilter(e.target.value)}
              placeholder="Фильтр по ФИО курсанта (например: Насибуллина)"
              aria-label="Фильтр по ФИО в истории талонов"
            />
          </div>
          <div className="admin-schedule-table-wrap admin-history-table-wrap">
            <table className="admin-schedule-table admin-history-table">
              <thead>
                <tr>
                  {talonSelectionMode ? (
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Выбрать все строки"
                        checked={allFilteredSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someFilteredSelected;
                        }}
                        onChange={toggleSelectAllFilteredRows}
                      />
                    </th>
                  ) : null}
                  <th>Дата</th>
                  <th>Время</th>
                  <th>Списание / зачисление</th>
                  <th>Роль</th>
                  <th>Фамилия И.О.</th>
                  <th>Кем</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdminTalonEntries.length === 0 ? (
                  <tr>
                    <td colSpan={talonSelectionMode ? 7 : 6} className="admin-schedule-table-empty">
                      {adminTalonEntries.length === 0
                        ? "Записей пока нет. Зачисление и списание талонов администратором фиксируются при сохранении в карточках курсантов и инструкторов."
                        : talonFioFilterNorm
                          ? "По этому ФИО записей не найдено."
                          : "Нет операций администратора по талонам. Списания за вождение (инструктор — курсант) здесь не отображаются."}
                    </td>
                  </tr>
                ) : (
                  filteredAdminTalonEntries.map((e) => {
                    const fromParty =
                      e.fromUid && e.fromRole
                        ? `${e.fromRole === "admin" ? "Админ" : roleLabel[e.fromRole]} / ${formatShortFio(e.fromDisplayName ?? "")}`
                        : "—";
                    return (
                      <tr key={e.id}>
                        {talonSelectionMode ? (
                          <td>
                            <input
                              type="checkbox"
                              aria-label="Выбрать запись"
                              checked={selectedTalonIdSet.has(e.id)}
                              onChange={() => toggleRowSelected(e.id)}
                            />
                          </td>
                        ) : null}
                        <td>{formatRuDate(e.at)}</td>
                        <td>{formatRuTime(e.at)}</td>
                        <td>
                          {e.delta > 0 ? (
                            <span className="admin-history-talon-op">
                              <span className="admin-history-talon-op__label admin-history-talon-op__label--credit">
                                {`Зачисление${e.talonKind === "exam" ? " (экзамен)" : ""}`}
                              </span>
                              <span className="admin-history-talon-op__value admin-history-talon-op__value--credit">
                                +{e.delta}
                              </span>
                            </span>
                          ) : e.delta < 0 ? (
                            <span className="admin-history-talon-op">
                              <span className="admin-history-talon-op__label admin-history-talon-op__label--debit">
                                {`Списание${e.talonKind === "exam" ? " (экзамен)" : ""}`}
                              </span>
                              <span className="admin-history-talon-op__value admin-history-talon-op__value--debit">
                                -{Math.abs(e.delta)}
                              </span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
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
        </div>
      </section>

      <section className="admin-history-section" aria-labelledby="history-users-heading">
        <button
          type="button"
          id="history-users-heading"
          className="instructor-home-section-toggle glossy-panel admin-history-collapse-toggle"
          aria-expanded={usersOpen}
          aria-controls="history-users-panel"
          onClick={() => setUsersOpen((o) => !o)}
        >
          <span className="instructor-home-section-toggle-label">Пользователи</span>
          <span className="instructor-home-section-toggle-meta">{userRows.length}</span>
          <IconChevron open={usersOpen} />
        </button>
        <div
          id="history-users-panel"
          className="admin-history-collapse-panel"
          hidden={!usersOpen}
        >
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
        </div>
      </section>

      <section className="admin-history-section" aria-labelledby="history-audit-heading">
        <button
          type="button"
          id="history-audit-heading"
          className="instructor-home-section-toggle glossy-panel admin-history-collapse-toggle"
          aria-expanded={auditOpen}
          aria-controls="history-audit-panel"
          onClick={() => setAuditOpen((o) => !o)}
        >
          <span className="instructor-home-section-toggle-label">Аудит действий</span>
          <span className="instructor-home-section-toggle-meta">журнал</span>
          <IconChevron open={auditOpen} />
        </button>
        <div
          id="history-audit-panel"
          className="admin-history-collapse-panel"
          hidden={!auditOpen}
        >
          <AuditLogPanel />
        </div>
      </section>
    </div>
  );
}
