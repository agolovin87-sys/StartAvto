import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppBrandIcon } from "@/components/AppBrandIcon";
import { APP_ASSET_VERSION } from "@/lib/appAssetVersion";
import { detectCabinetClientKind } from "@/lib/clientPlatform";

type InstallTab = "ios" | "android" | "pc";

function parseTab(raw: string | null): InstallTab | null {
  if (raw === "ios" || raw === "android" || raw === "pc") return raw;
  return null;
}

function defaultTabFromUa(): InstallTab {
  const k = detectCabinetClientKind();
  if (k === "ios") return "ios";
  if (k === "android") return "android";
  return "pc";
}

export function InstallAppPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<InstallTab>(() => {
    return parseTab(searchParams.get("tab")) ?? defaultTabFromUa();
  });
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installBusy, setInstallBusy] = useState(false);
  const [installHint, setInstallHint] = useState<string | null>(null);

  const standalone = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }, []);

  useEffect(() => {
    const t = parseTab(searchParams.get("tab"));
    if (t) setTab(t);
  }, [searchParams]);

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
    setInstallBusy(true);
    setInstallHint(null);
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setInstallHint(
        outcome === "accepted"
          ? "Установка запущена. Проверьте ярлык на рабочем столе или в меню «Пуск»."
          : "Установка отменена. Можно воспользоваться инструкцией ниже."
      );
    } catch {
      setInstallHint("Не удалось открыть окно установки — используйте шаги вручную.");
    } finally {
      setInstallBusy(false);
      setDeferred(null);
    }
  }, [deferred]);

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide install-app-card">
        <p className="auth-footer install-app-back-top">
          <Link to={`/login?install=1&refresh=${APP_ASSET_VERSION}`}>← Ко входу с подсказкой по установке</Link>
          {" · "}
          <Link to={`/register?install=1&refresh=${APP_ASSET_VERSION}`}>Регистрация</Link>
        </p>
        <div className="install-app-icon-wrap">
          <AppBrandIcon className="install-app-icon" size={112} alt="StartAvto" />
        </div>
        <h1 className="auth-title">Установка приложения</h1>
        <p className="auth-lead install-app-lead">
          Добавьте StartAvto на главный экран или рабочий стол — откроется как отдельное приложение, без
          адресной строки.
        </p>

        {standalone ? (
          <p className="install-app-banner" role="status">
            Вы уже открыли установленную версию приложения.
          </p>
        ) : null}

        <div className="install-app-tabs" role="tablist" aria-label="Тип устройства">
          {(
            [
              { id: "ios" as const, label: "iPhone / iPad" },
              { id: "android" as const, label: "Android" },
              { id: "pc" as const, label: "Компьютер" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "install-app-tab is-active" : "install-app-tab"}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="install-app-panel" role="tabpanel">
          {tab === "ios" ? (
            <IosInstructions />
          ) : tab === "android" ? (
            <AndroidInstructions />
          ) : (
            <PcInstructions
              deferred={deferred}
              installBusy={installBusy}
              installHint={installHint}
              onInstall={runInstall}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function IosInstructions() {
  return (
    <ol className="install-app-steps">
      <li>
        Откройте сайт <strong>в браузере Safari</strong> (не внутри других приложений).
      </li>
      <li>
        Нажмите кнопку <strong>Поделиться</strong> внизу экрана (квадрат со стрелкой вверх).
      </li>
      <li>
        Прокрутите меню вниз и выберите{" "}
        <strong>«На экран «Домой»»</strong> или <strong>«Добавить на главный экран»</strong>.
      </li>
      <li>
        При необходимости измените название ярлыка и нажмите <strong>«Добавить»</strong>.
      </li>
      <li>Готово: запускайте StartAvto с главного экрана, как обычное приложение.</li>
    </ol>
  );
}

function AndroidInstructions() {
  return (
    <ol className="install-app-steps">
      <li>
        Откройте сайт в <strong>Google Chrome</strong> (рекомендуется) или другом браузере на Android.
      </li>
      <li>
        Откройте меню браузера <strong>три точки ⋮</strong> в правом верхнем углу.
      </li>
      <li>
        Выберите <strong>«Установить приложение»</strong>, <strong>«Добавить на главный экран»</strong> или
        похожий пункт.
      </li>
      <li>Подтвердите установку — на рабочем столе или в списке приложений появится ярлык StartAvto.</li>
      <li>
        Если пункта установки нет: в Chrome откройте меню → <strong>«Добавить на главный экран»</strong> вручную.
      </li>
    </ol>
  );
}

function PcInstructions({
  deferred,
  installBusy,
  installHint,
  onInstall,
}: {
  deferred: BeforeInstallPromptEvent | null;
  installBusy: boolean;
  installHint: string | null;
  onInstall: () => void;
}) {
  return (
    <>
      {deferred ? (
        <div className="install-app-pc-action">
          <button
            type="button"
            className="btn btn-primary"
            disabled={installBusy}
            onClick={() => void onInstall()}
          >
            {installBusy ? "Установка…" : "Установить StartAvto"}
          </button>
          <p className="field-hint install-app-hint">
            Кнопка появляется в поддерживаемых браузерах (Chrome, Edge и др.). Если её нет — следуйте шагам
            ниже.
          </p>
        </div>
      ) : (
        <p className="field-hint install-app-hint">
          Если браузер предложит установку — согласитесь. Иначе добавьте ярлык вручную по инструкции.
        </p>
      )}
      {installHint ? (
        <p className="install-app-result" role="status">
          {installHint}
        </p>
      ) : null}
      <ol className="install-app-steps">
        <li>
          <strong>Google Chrome или Microsoft Edge:</strong> в адресной строке справа может быть значок
          установки <strong>⊕</strong> или компьютера — нажмите его и подтвердите.
        </li>
        <li>
          Либо: меню браузера <strong>⋮</strong> или <strong>⋯</strong> →{" "}
          <strong>«Установить StartAvto…»</strong> / <strong>«Приложения»</strong> → установить.
        </li>
        <li>
          <strong>Ярлык без установки:</strong> перетащите значок замка или сайта из адресной строки на рабочий
          стол (в Chrome).
        </li>
        <li>
          <strong>Другие браузеры</strong> (Firefox, Safari на Mac) могут не поддерживать установку как PWA —
          пользуйтесь закладкой или ярлыком на рабочем столе.
        </li>
      </ol>
    </>
  );
}
