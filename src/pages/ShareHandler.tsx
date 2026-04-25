import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SharedTargetPayload } from "@/types/shareTarget";

const STORAGE_KEY = "startavto_shared_target_payload";

function safeDecode(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function readSharedFiles(shareId: string, count: number): Promise<File[]> {
  const files: File[] = [];
  for (let i = 0; i < count; i += 1) {
    const response = await fetch(`/__shared__/${shareId}/${i}`, { cache: "no-store" });
    if (!response.ok) continue;
    const blob = await response.blob();
    const rawName = response.headers.get("x-share-filename") || `shared-${i + 1}`;
    const fileName = safeDecode(rawName) || `shared-${i + 1}`;
    const mimeType = response.headers.get("content-type") || blob.type || "application/octet-stream";
    files.push(new File([blob], fileName, { type: mimeType }));
  }
  return files;
}

export function ShareHandler() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const title = safeDecode(params.get("title"));
        const text = safeDecode(params.get("text"));
        const url = safeDecode(params.get("url"));
        const shareId = params.get("shareId");
        const filesCountRaw = Number(params.get("files") || "0");
        const filesCount = Number.isFinite(filesCountRaw) ? Math.max(0, filesCountRaw) : 0;
        const files = shareId && filesCount > 0 ? await readSharedFiles(shareId, filesCount) : [];

        if (cancelled) return;

        const payload: SharedTargetPayload = {
          title,
          text,
          url,
          files,
          timestamp: Date.now(),
        };

        window.__startAvtoSharedData = payload;
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            title: payload.title,
            text: payload.text,
            url: payload.url,
            timestamp: payload.timestamp,
          })
        );

        navigate("/app", { replace: true });
      } catch (e) {
        if (cancelled) return;
        console.error("Ошибка обработки share target", e);
        setError("Не удалось обработать данные из системного меню «Поделиться».");
        window.setTimeout(() => navigate("/app", { replace: true }), 2000);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={styles.spinner} />
        <p style={styles.text}>{error ?? "Обрабатываем данные из «Поделиться»..."}</p>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    color: "#e2e8f0",
    padding: 16,
  },
  card: {
    border: "1px solid #334155",
    borderRadius: 14,
    background: "#111827",
    padding: "18px 16px",
    width: "100%",
    maxWidth: 360,
    display: "grid",
    justifyItems: "center",
    gap: 10,
  },
  spinner: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "3px solid #334155",
    borderTopColor: "#3b82f6",
  },
  text: {
    margin: 0,
    fontSize: 14,
    textAlign: "center",
    color: "#cbd5e1",
  },
};
