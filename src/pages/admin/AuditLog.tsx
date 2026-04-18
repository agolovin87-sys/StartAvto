/**
 * Журнал аудита действий (только администратор).
 * Встраивается во вкладку «История» админ-панели.
 */
import { useMemo, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import { AuditDetailModal } from "@/components/admin/AuditDetailModal";
import { useAudit } from "@/hooks/useAudit";
import { useAuth } from "@/context/AuthContext";
import type { ActionType, AuditLog as AuditLogRow, AuditLogFilters } from "@/types/audit";
import { ALL_ACTION_TYPES } from "@/types/auditConstants";

function formatRuDateTime(ms: number): string {
  return new Date(ms).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function endOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

const STATUS_OPTIONS: { value: "" | "success" | "failed"; label: string }[] = [
  { value: "", label: "Все статусы" },
  { value: "success", label: "Успех" },
  { value: "failed", label: "Ошибка" },
];

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export function AuditLogPanel() {
  const { profile } = useAuth();
  const { rawLogs, loading, err, getLogs, exportLogs } = useAudit();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState<ActionType | "">("");
  const [status, setStatus] = useState<"" | "success" | "failed">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);
  const [detail, setDetail] = useState<AuditLogRow | null>(null);

  const userOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rawLogs) {
      if (!m.has(r.userId)) m.set(r.userId, r.userName);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "ru"));
  }, [rawLogs]);

  const filters: AuditLogFilters = useMemo(() => {
    let df: number | undefined;
    let dt: number | undefined;
    if (dateFrom) {
      const [y, mo, d] = dateFrom.split("-").map(Number);
      df = startOfDayMs(new Date(y, mo - 1, d));
    }
    if (dateTo) {
      const [y, mo, d] = dateTo.split("-").map(Number);
      dt = endOfDayMs(new Date(y, mo - 1, d));
    }
    return {
      dateFrom: df,
      dateTo: dt,
      userId: userId || undefined,
      action: action || undefined,
      status: status || undefined,
      search: search || undefined,
    };
  }, [dateFrom, dateTo, userId, action, status, search]);

  const filtered = useMemo(() => getLogs(filters), [getLogs, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const sliceStart = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(sliceStart, sliceStart + pageSize);

  if (profile && profile.role !== "admin") {
    return (
      <p className="admin-audit-denied">Журнал аудита доступен только администратору.</p>
    );
  }

  return (
    <div className="admin-audit-root">
      {err ? (
        <div className="form-error" role="alert">
          {err}
        </div>
      ) : null}

      <div className="admin-audit-filters">
        <label className="admin-audit-field">
          <span>Дата с</span>
          <input
            type="date"
            className="input"
            value={dateFrom}
            onChange={(e) => {
              setPage(1);
              setDateFrom(e.target.value);
            }}
          />
        </label>
        <label className="admin-audit-field">
          <span>Дата по</span>
          <input
            type="date"
            className="input"
            value={dateTo}
            onChange={(e) => {
              setPage(1);
              setDateTo(e.target.value);
            }}
          />
        </label>
        <label className="admin-audit-field">
          <span>Пользователь</span>
          <select
            className="input"
            value={userId}
            onChange={(e) => {
              setPage(1);
              setUserId(e.target.value);
            }}
          >
            <option value="">Все</option>
            {userOptions.map(([uid, name]) => (
              <option key={uid} value={uid}>
                {formatShortFio(name)} ({uid.slice(0, 6)}…)
              </option>
            ))}
          </select>
        </label>
        <label className="admin-audit-field">
          <span>Действие</span>
          <select
            className="input"
            value={action}
            onChange={(e) => {
              setPage(1);
              setAction((e.target.value as ActionType) || "");
            }}
          >
            <option value="">Все</option>
            {ALL_ACTION_TYPES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-audit-field">
          <span>Статус</span>
          <select
            className="input"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as typeof status);
            }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-audit-field admin-audit-field--grow">
          <span>Поиск</span>
          <input
            type="search"
            className="input"
            placeholder="Имя, объект, IP, действие…"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </label>
      </div>

      <div className="admin-audit-toolbar">
        <span className="admin-audit-meta">
          {loading ? "Загрузка…" : `Записей: ${filtered.length}`}
        </span>
        <div className="admin-audit-toolbar-right">
          <label className="admin-audit-page-size">
            На странице
            <select
              className="input input-inline"
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={loading || filtered.length === 0}
            onClick={() => void exportLogs(filters, `audit-${Date.now()}.csv`)}
          >
            Экспорт в CSV
          </button>
        </div>
      </div>

      <div className="admin-schedule-table-wrap admin-audit-table-wrap">
        <table className="admin-schedule-table admin-audit-table">
          <thead>
            <tr>
              <th>Дата и время</th>
              <th>Пользователь</th>
              <th>Действие</th>
              <th>Объект</th>
              <th>Статус</th>
              <th>IP</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="admin-schedule-table-empty">
                  Загрузка журнала…
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="admin-schedule-table-empty">
                  Нет записей по выбранным фильтрам.
                </td>
              </tr>
            ) : (
              pageRows.map((r) => (
                <tr key={r.id}>
                  <td>{formatRuDateTime(r.timestamp)}</td>
                  <td>{formatShortFio(r.userName)}</td>
                  <td>
                    <code className="admin-audit-code">{r.action}</code>
                  </td>
                  <td>
                    <span className="admin-audit-entity" title={r.entityName ?? ""}>
                      {r.entityName ?? r.entityType}
                      {r.entityId ? ` · ${r.entityId.slice(0, 8)}…` : ""}
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        r.status === "success"
                          ? "admin-audit-pill admin-audit-pill--ok"
                          : "admin-audit-pill admin-audit-pill--err"
                      }
                    >
                      {r.status === "success" ? "Ок" : "Ошибка"}
                    </span>
                  </td>
                  <td className="admin-audit-ip">{r.ipAddress}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setDetail(r)}
                    >
                      Подробнее
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="admin-audit-pager">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Назад
          </button>
          <span className="admin-audit-pager-info">
            Стр. {safePage} из {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Вперёд
          </button>
        </div>
      ) : null}

      <AuditDetailModal open={detail != null} row={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

/** Алиас для импорта по имени из ТЗ (`AuditLog`). */
export { AuditLogPanel as AuditLog };
