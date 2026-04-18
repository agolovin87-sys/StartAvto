/**
 * Журнал аудита для администратора: подписка, фильтрация, экспорт CSV.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { ActionType, AuditLog, AuditLogFilters } from "@/types/audit";
import { fetchRecentAuditLogs, subscribeAuditLogs } from "@/firebase/auditLogs";
import { logAuditAction } from "@/utils/audit";

function matchesFilters(row: AuditLog, f: AuditLogFilters): boolean {
  if (f.dateFrom != null && row.timestamp < f.dateFrom) return false;
  if (f.dateTo != null && row.timestamp > f.dateTo) return false;
  if (f.userId && row.userId !== f.userId) return false;
  if (f.action && row.action !== f.action) return false;
  if (f.status && row.status !== f.status) return false;
  const q = f.search?.trim().toLowerCase();
  if (q) {
    const hay = [
      row.userName,
      row.entityName ?? "",
      row.entityId ?? "",
      row.action,
      row.ipAddress,
    ]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function rowToCsvLine(cols: string[]): string {
  return cols
    .map((c) => {
      const s = c.replace(/"/g, '""');
      if (/[",\n\r]/.test(s)) return `"${s}"`;
      return s;
    })
    .join(";");
}

export function useAudit() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [rawLogs, setRawLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setRawLogs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    const unsub = subscribeAuditLogs(
      (rows) => {
        setRawLogs(rows);
        setLoading(false);
      },
      (e) => {
        setErr(e.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [isAdmin]);

  const getLogs = useCallback((filters: AuditLogFilters): AuditLog[] => {
    return rawLogs.filter((r) => matchesFilters(r, filters));
  }, [rawLogs]);

  const log = useCallback(
    (
      action: ActionType,
      entityType: AuditLog["entityType"],
      options?: Parameters<typeof logAuditAction>[2]
    ) => logAuditAction(action, entityType, options),
    []
  );

  const exportLogs = useCallback(
    async (filters: AuditLogFilters, filename = "audit-export.csv") => {
      let rows = getLogs(filters);
      if (rows.length === 0) {
        rows = (await fetchRecentAuditLogs()).filter((r) => matchesFilters(r, filters));
      }
      const header = [
        "id",
        "timestamp",
        "userName",
        "userRole",
        "action",
        "entityType",
        "entityId",
        "entityName",
        "status",
        "ipAddress",
        "userAgent",
      ];
      const lines = [rowToCsvLine(header)];
      for (const r of rows) {
        lines.push(
          rowToCsvLine([
            r.id,
            new Date(r.timestamp).toISOString(),
            r.userName,
            r.userRole,
            r.action,
            r.entityType,
            r.entityId ?? "",
            r.entityName ?? "",
            r.status,
            r.ipAddress,
            r.userAgent,
          ])
        );
      }
      const bom = "\uFEFF";
      const blob = new Blob([bom + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    [getLogs]
  );

  const stats = useMemo(
    () => ({ total: rawLogs.length, lastAt: rawLogs[0]?.timestamp ?? null }),
    [rawLogs]
  );

  return {
    log,
    getLogs,
    exportLogs,
    rawLogs,
    loading,
    err,
    isAdmin,
    stats,
  };
}
