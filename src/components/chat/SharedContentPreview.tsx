import type { CSSProperties } from "react";
import { useState } from "react";
import type { SharedTargetPayload } from "@/types/shareTarget";

type SharedContentPreviewProps = {
  sharedData: SharedTargetPayload;
  onUse: (data: { text?: string; files?: File[] }) => void;
  onCancel: () => void;
};

export function SharedContentPreview({ sharedData, onUse, onCancel }: SharedContentPreviewProps) {
  const [sending, setSending] = useState(false);

  const textParts = [sharedData.title, sharedData.text, sharedData.url].filter(
    (x): x is string => Boolean(x && x.trim())
  );

  const onConfirm = () => {
    if (sending) return;
    setSending(true);
    onUse({
      text: textParts.join("\n").trim() || undefined,
      files: sharedData.files ?? [],
    });
  };

  return (
    <div style={styles.overlay} role="presentation">
      <div style={styles.card} role="dialog" aria-modal="true" aria-label="Поделиться в чат">
        <div style={styles.head}>
          <strong>Поделиться в чат</strong>
        </div>
        <div style={styles.body}>
          {textParts.length > 0 ? (
            <div style={styles.text}>{textParts.join("\n")}</div>
          ) : null}
          {(sharedData.files?.length ?? 0) > 0 ? (
            <div style={styles.files}>
              <p>Файлы:</p>
              <ul>
                {sharedData.files?.map((f, i) => (
                  <li key={`${f.name}-${i}`}>{f.name}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div style={styles.actions}>
          <button type="button" style={styles.primaryBtn} onClick={onConfirm} disabled={sending}>
            Отправить в чат
          </button>
          <button type="button" style={styles.secondaryBtn} onClick={onCancel} disabled={sending}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(2, 6, 23, 0.72)",
    zIndex: 1200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 14,
    color: "#e2e8f0",
    overflow: "hidden",
  },
  head: {
    padding: "14px 16px",
    borderBottom: "1px solid #334155",
  },
  body: {
    padding: 16,
    display: "grid",
    gap: 10,
    maxHeight: "50vh",
    overflowY: "auto",
  },
  text: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: 14,
    background: "#111827",
    borderRadius: 10,
    padding: 10,
  },
  files: {
    fontSize: 13,
    color: "#cbd5e1",
  },
  actions: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    padding: 16,
    borderTop: "1px solid #334155",
  },
  primaryBtn: {
    border: "none",
    borderRadius: 10,
    padding: "10px 12px",
    background: "#3b82f6",
    color: "#fff",
    cursor: "pointer",
  },
  secondaryBtn: {
    border: "1px solid #334155",
    borderRadius: 10,
    padding: "10px 12px",
    background: "transparent",
    color: "#cbd5e1",
    cursor: "pointer",
  },
};
