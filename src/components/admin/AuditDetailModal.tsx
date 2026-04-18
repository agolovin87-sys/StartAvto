import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { AuditLog } from "@/types/audit";

type Props = {
  open: boolean;
  row: AuditLog | null;
  onClose: () => void;
};

function jsonBlock(label: string, value: Record<string, unknown> | undefined) {
  if (!value || Object.keys(value).length === 0) {
    return (
      <div className="admin-audit-detail-block">
        <div className="admin-audit-detail-label">{label}</div>
        <pre className="admin-audit-detail-json admin-audit-detail-json--empty">—</pre>
      </div>
    );
  }
  return (
    <div className="admin-audit-detail-block">
      <div className="admin-audit-detail-label">{label}</div>
      <pre className="admin-audit-detail-json">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function AuditDetailModal({ open, row, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !row || typeof document === "undefined") return null;

  return createPortal(
    <div className="admin-audit-modal-overlay" role="presentation">
      <button
        type="button"
        className="admin-audit-modal-backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div
        className="admin-audit-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-audit-detail-title"
      >
        <div className="admin-audit-modal-head">
          <h2 id="admin-audit-detail-title" className="admin-audit-modal-title">
            Запись аудита
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <dl className="admin-audit-detail-dl">
          <div className="admin-audit-detail-row">
            <dt>Дата и время</dt>
            <dd>{new Date(row.timestamp).toLocaleString("ru-RU")}</dd>
          </div>
          <div className="admin-audit-detail-row">
            <dt>Пользователь</dt>
            <dd>
              {row.userName} ({row.userRole})
            </dd>
          </div>
          <div className="admin-audit-detail-row">
            <dt>Действие</dt>
            <dd>{row.action}</dd>
          </div>
          <div className="admin-audit-detail-row">
            <dt>Объект</dt>
            <dd>
              {row.entityType}
              {row.entityId ? ` · ${row.entityId}` : ""}
            </dd>
          </div>
          {row.entityName ? (
            <div className="admin-audit-detail-row">
              <dt>Описание</dt>
              <dd>{row.entityName}</dd>
            </div>
          ) : null}
          <div className="admin-audit-detail-row">
            <dt>Статус</dt>
            <dd>{row.status === "success" ? "Успех" : "Ошибка"}</dd>
          </div>
          {row.errorMessage ? (
            <div className="admin-audit-detail-row">
              <dt>Ошибка</dt>
              <dd className="admin-audit-detail-err">{row.errorMessage}</dd>
            </div>
          ) : null}
          <div className="admin-audit-detail-row">
            <dt>IP</dt>
            <dd>{row.ipAddress}</dd>
          </div>
          <div className="admin-audit-detail-row">
            <dt>User-Agent</dt>
            <dd className="admin-audit-detail-ua">{row.userAgent || "—"}</dd>
          </div>
        </dl>
        {jsonBlock("Старое значение (oldValue)", row.oldValue)}
        {jsonBlock("Новое значение (newValue)", row.newValue)}
      </div>
    </div>,
    document.body
  );
}
