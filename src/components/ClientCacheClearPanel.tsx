import { type ReactNode, useState } from "react";
import { clearAppClientCache } from "@/utils/clearAppClientCache";

type Props = {
  /** Подзаголовок над описанием (как у админа под Firebase). */
  showSubtitle?: boolean;
  description: ReactNode;
};

export function ClientCacheClearPanel({ showSubtitle = false, description }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleClear = async () => {
    if (
      !window.confirm(
        "Очистить локальный кэш? Будут удалены сохранённые черновики чатов, очищены sessionStorage и кэши страницы (если есть). Вход, тема и настройки уведомлений сохранятся."
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const r = await clearAppClientCache();
      const parts: string[] = [];
      if (r.removedDraftKeys > 0) {
        parts.push(
          r.removedDraftKeys === 1 ? "1 черновик" : `черновиков: ${r.removedDraftKeys}`
        );
      }
      if (r.clearedSessionStorage) parts.push("sessionStorage");
      if (r.clearedCacheStorage > 0) parts.push(`кэшей: ${r.clearedCacheStorage}`);
      setMessage(
        parts.length > 0
          ? `Готово: ${parts.join(", ")}.`
          : "Готово. Локальных черновиков и кэшей не найдено."
      );
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Не удалось очистить кэш");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-settings-clear-cache-block">
      {showSubtitle ? (
        <h3 className="admin-settings-subtitle">Локальный кэш браузера</h3>
      ) : null}
      <div className="admin-settings-section-desc admin-settings-clear-cache-desc">{description}</div>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => void handleClear()}
      >
        {busy ? "Очистка…" : "Очистить кэш"}
      </button>
      {message ? (
        <p className="admin-settings-clear-cache-msg" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
