import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { detectCabinetClientKind } from "@/lib/clientPlatform";

function useStandaloneMode(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }, []);
}

function shortInstruction(): string {
  const k = detectCabinetClientKind();
  if (k === "ios") {
    return "iPhone / iPad: откройте сайт в Safari → кнопка «Поделиться» (квадрат со стрелкой) → «На экран „Домой“».";
  }
  if (k === "android") {
    return "Android: в Chrome нажмите меню «⋮» → «Установить приложение» или «Добавить на главный экран».";
  }
  return "Компьютер: в Chrome или Edge нажмите значок установки в адресной строке или откройте меню браузера → «Установить StartAvto».";
}

/**
 * Краткая инструкция + кнопка «Установить», если браузер отдаёт beforeinstallprompt.
 */
export function WebAppInstallCallout() {
  const standalone = useStandaloneMode();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const onBip = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const runInstall = useCallback(async () => {
    if (!deferred) return;
    setBusy(true);
    setHint(null);
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setHint(
        outcome === "accepted"
          ? "Готово. Проверьте ярлык на рабочем столе или в меню приложений."
          : "Окно закрыто. Ниже есть ссылка на полную инструкцию."
      );
    } catch {
      setHint("Автоустановка недоступна — откройте пошаговую инструкцию ниже.");
    } finally {
      setBusy(false);
      setDeferred(null);
    }
  }, [deferred]);

  if (standalone) {
    return (
      <div className="auth-install-callout auth-install-callout--ok" role="status">
        <p className="auth-install-callout-lead">
          Вы уже открыли StartAvto как установленное приложение.
        </p>
      </div>
    );
  }

  return (
    <div className="auth-install-callout glossy-panel">
      <p className="auth-install-callout-title">Установите веб-приложение</p>
      <p className="auth-install-callout-text">{shortInstruction()}</p>
      {deferred ? (
        <button
          type="button"
          className="btn btn-primary auth-install-callout-btn"
          disabled={busy}
          onClick={() => void runInstall()}
        >
          {busy ? "Установка…" : "Установить"}
        </button>
      ) : null}
      {hint ? (
        <p className="auth-install-callout-hint" role="status">
          {hint}
        </p>
      ) : null}
      <p className="auth-install-callout-more">
        <Link to="/install">Пошаговая инструкция (iPhone, Android, ПК)</Link>
      </p>
    </div>
  );
}
