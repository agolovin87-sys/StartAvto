import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatShortFio } from "@/admin/formatShortFio";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FirstLaunchPermissions } from "@/components/FirstLaunchPermissions";
import { IconInstallApp } from "@/components/IconInstallApp";
import { useAuth } from "@/context/AuthContext";
import {
  ChatThreadShellProvider,
  useChatThreadShell,
} from "@/context/ChatThreadShellContext";
import type { UserRole } from "@/types";
import { doc, updateDoc } from "firebase/firestore";
import { getFirebase } from "@/firebase/config";
import { appIconUrl } from "@/lib/appAssetVersion";
import { detectCabinetClientKind } from "@/lib/clientPlatform";
import { probeInternetReachable } from "@/utils/internetReachable";
import {
  CHAT_PRIVACY_SETTINGS_EVENT,
  getChatPrivacySettings,
} from "@/admin/adminChatPrivacySettings";

const roleLabel: Record<UserRole, string> = {
  admin: "Администратор",
  instructor: "Инструктор",
  student: "Курсант",
};

function IconLogout() {
  return (
    <svg className="shell-logout-ico" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"
      />
    </svg>
  );
}

/** Material-style wifi — зелёный индикатор «есть сеть» */
function IconWifi() {
  return (
    <svg
      className="shell-meta-wifi-ico"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"
      />
    </svg>
  );
}

/** Material-style wifi_off — перечёркнутый Wi‑Fi */
function IconNoSignal() {
  return (
    <svg
      className="shell-meta-no-signal-ico"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.89.19-4.15.48L18.18 13.8 23.64 7zm-6.6 8.22L3.27 1.44 2 2.72l2.05 2.06C1.91 5.76.59 6.82.36 7l11.63 14.49L12 22l.01-.01-.02-.02L19.35 13.2l2.54 2.54 1.27-1.27L17.03 12.4z"
      />
    </svg>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const { shellHeaderHidden } = useChatThreadShell();
  const [networkOnline, setNetworkOnline] = useState(
    () => (typeof navigator !== "undefined" ? navigator.onLine : true),
  );

  useEffect(() => {
    let cancelled = false;

    const apply = (ok: boolean) => {
      if (!cancelled) setNetworkOnline(ok);
    };

    const runProbe = () => {
      void probeInternetReachable().then(apply);
    };

    const onOffline = () => apply(false);
    const onOnline = () => {
      void probeInternetReachable().then(apply);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") runProbe();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);

    runProbe();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") runProbe();
    }, 25_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // presence: heartbeat, иначе в Firestore «залипает» state: online (мобильные без beforeunload).
  const [privacyTick, setPrivacyTick] = useState(0);
  useEffect(() => {
    const bump = () => setPrivacyTick((t) => t + 1);
    window.addEventListener(CHAT_PRIVACY_SETTINGS_EVENT, bump);
    return () => window.removeEventListener(CHAT_PRIVACY_SETTINGS_EVENT, bump);
  }, []);

  /** Только uid (+ privacyTick): иначе каждый heartbeat/snapshot профиля перезапускал эффект → setOffline/setOnline в цикле и «Maximum update depth» в AuthContext. */
  const presenceUserId = profile?.uid ?? "";

  /** Последний тип клиента ЛК (iOS/Android/веб) — для превью у админа; не зависит от настроек «показывать онлайн». */
  const cabinetClientUid = profile?.uid ?? "";
  useEffect(() => {
    if (!cabinetClientUid) return;
    const { db } = getFirebase();
    const writeKind = () => {
      try {
        void updateDoc(doc(db, "users", cabinetClientUid), {
          lastCabinetClientKind: detectCabinetClientKind(),
        });
      } catch {
        // ignore
      }
    };
    writeKind();
    const onVis = () => {
      if (document.visibilityState === "visible") writeKind();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [cabinetClientUid]);

  useEffect(() => {
    if (!presenceUserId) return;
    const { db } = getFirebase();
    let cancelled = false;

    const setOnline = async () => {
      try {
        await updateDoc(doc(db, "users", presenceUserId), {
          lastCabinetClientKind: detectCabinetClientKind(),
          presence: {
            state: "online",
            lastSeenAt: null,
            heartbeatAt: Date.now(),
          },
        });
      } catch {
        // ignore
      }
    };

    const setOffline = async () => {
      if (cancelled) return;
      try {
        await updateDoc(doc(db, "users", presenceUserId), {
          presence: {
            state: "offline" as const,
            lastSeenAt: Date.now(),
            heartbeatAt: null,
          },
        });
      } catch {
        // ignore
      }
    };

    const share =
      getChatPrivacySettings(presenceUserId).shareOnlineWithContacts;

    if (!share) {
      void setOffline();
      return () => {
        cancelled = true;
        void setOffline();
      };
    }

    void setOnline();
    const heartbeatMs = 45_000;
    const heartbeatId = window.setInterval(() => {
      if (getChatPrivacySettings(presenceUserId).shareOnlineWithContacts)
        void setOnline();
      else void setOffline();
    }, heartbeatMs);

    const onHide = () => {
      void setOffline();
    };
    window.addEventListener("beforeunload", onHide);
    window.addEventListener("pagehide", onHide);

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (getChatPrivacySettings(presenceUserId).shareOnlineWithContacts)
        void setOnline();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatId);
      window.removeEventListener("beforeunload", onHide);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      void setOffline();
    };
  }, [presenceUserId, privacyTick]);

  return (
    <div className={shellHeaderHidden ? "shell shell--chat-thread" : "shell"}>
      {shellHeaderHidden ? null : (
        <header className="shell-header">
          <div className="shell-header-inner">
            <Link
              to="/app"
              className="shell-brand shell-brand--glow"
              aria-label="StartAvto"
            >
              <img
                className="shell-brand-ico"
                src={appIconUrl()}
                alt=""
                width={34}
                height={34}
                decoding="async"
              />
              <span aria-hidden className="shell-brand-chars">
                {"StartAvto".split("").map((letter, i) => (
                  <span
                    key={i}
                    className="shell-brand-char"
                    style={{ animationDelay: `${i * 0.085}s` }}
                  >
                    {letter}
                  </span>
                ))}
              </span>
            </Link>
            {profile ? (
              <div className="shell-header-meta">
                <span className="shell-header-fio">
                  {formatShortFio(profile.displayName ?? "")}
                </span>
                <span
                  className={
                    networkOnline
                      ? "shell-header-meta-sep-wrap"
                      : "shell-header-meta-sep-wrap shell-header-meta-sep-wrap--offline"
                  }
                  aria-hidden={networkOnline}
                  {...(!networkOnline
                    ? ({
                        role: "status",
                        "aria-label": "Нет подключения к интернету",
                      } as const)
                    : {})}
                >
                  {networkOnline ? (
                    <span className="shell-header-meta-wifi">
                      <IconWifi />
                    </span>
                  ) : (
                    <>
                      <span className="shell-header-meta-sep-offline">
                        <IconNoSignal />
                      </span>
                      <span className="shell-header-meta-offline-hint">
                        (нет интернета)
                      </span>
                    </>
                  )}
                </span>
                <span className="shell-header-role">
                  {roleLabel[profile.role]}
                </span>
              </div>
            ) : null}
          </div>
          <div className="shell-user">
            <Link
              to="/install"
              className="shell-install-btn"
              aria-label="Установка приложения"
              title="Установка приложения"
            >
              <IconInstallApp />
            </Link>
            <button
              type="button"
              className="shell-logout-btn"
              aria-label="Выйти"
              onClick={() => setExitConfirmOpen(true)}
            >
              <IconLogout />
            </button>
          </div>
        </header>
      )}
      <main
        className={
          shellHeaderHidden ? "shell-main shell-main--chat-thread" : "shell-main"
        }
      >
        {children}
      </main>

      <ConfirmDialog
        open={exitConfirmOpen}
        title="Вы уверены?"
        message="Можно просто свернуть приложение!"
        confirmLabel="Да"
        cancelLabel="Нет"
        onConfirm={() => {
          setExitConfirmOpen(false);
          void signOut();
        }}
        onCancel={() => setExitConfirmOpen(false)}
      />
      <FirstLaunchPermissions />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ChatThreadShellProvider>
      <AppShellInner>{children}</AppShellInner>
    </ChatThreadShellProvider>
  );
}
