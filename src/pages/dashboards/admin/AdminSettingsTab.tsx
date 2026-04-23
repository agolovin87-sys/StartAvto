import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getBadgingDiagnostics,
  isBadgePreferenceEnabled,
  notifyBadgePreferenceChanged,
  setBadgePreferenceEnabled,
} from "@/utils/badging";
import {
  DEFAULT_CHAT_PRIVACY_SETTINGS,
  getChatPrivacySettings,
  setChatPrivacySettings,
  subscribeChatPrivacySettings,
  type ChatPrivacySettings,
} from "@/admin/adminChatPrivacySettings";
import {
  DEFAULT_CHAT_LAST_SEEN_VISIBILITY_SETTINGS,
  setChatLastSeenVisibilitySettings,
  subscribeChatLastSeenVisibilitySettings,
  type ChatLastSeenVisibilitySettings,
} from "@/firebase/chatLastSeenVisibilitySettings";
import {
  INCOMING_SOUND_PRESETS,
  incomingSoundPresetAssetPath,
  incomingSoundPresetByAssetPath,
} from "@/admin/incomingSoundPresets";
import {
  browserNotifyPermissionRu,
  DEFAULT_NOTIFICATION_SETTINGS,
  getBrowserNotificationPermission,
  getNotificationSettings,
  MAX_INCOMING_SOUND_DATA_URL_CHARS,
  MAX_INCOMING_SOUND_FILE_BYTES,
  minutesToTimeInputValue,
  notificationsRequireSecureContext,
  setNotificationSettings,
  subscribeNotificationSettings,
  timeInputValueToMinutes,
  type BrowserNotifyPermissionLabel,
  type NotificationSettings,
} from "@/admin/notificationSettings";
import {
  browserGeolocationPermissionRu,
  detectBrowserGeolocationPermission,
  getMeetingGeolocationEnabled,
  meetingGeolocationRequiresSecureContext,
  setMeetingGeolocationEnabled,
  subscribeMeetingGeolocationSettings,
  type BrowserGeolocationPermissionLabel,
} from "@/admin/meetingGeolocationSettings";
import { playIncomingMessageSound } from "@/chat/incomingMessageAlerts";
import { VibrationIncomingSettingRow } from "@/components/VibrationIncomingSettingRow";
import { AVATAR_EXPORT_SIZE, drawCircularAvatar } from "@/admin/drawCircularAvatar";
import { updateUserProfileFields } from "@/firebase/admin";
import {
  adminPurgeUserChatDataInFirestore,
  fetchChatFirestoreMemorySnapshot,
  fetchUserDisplayNamesForAdmin,
  FIREBASE_CHAT_PLAN_BYTES,
  formatStorageBytes,
  type ChatFirestoreMemorySnapshot,
  type ChatMemoryPurgeCategory,
} from "@/firebase/adminChatFirestoreMemory";
import { ClientCacheClearPanel } from "@/components/ClientCacheClearPanel";
import {
  hasFcmVapidConfigured,
  registerWebPushAndSaveToken,
  removeAllFcmTokensForUser,
} from "@/firebase/fcm";
import { callSendTestPush } from "@/firebase/sendTestPush";
import {
  getTheme,
  setTheme,
  subscribeTheme,
  type ThemeMode,
} from "@/theme/themeSettings";
import { HapticFeedbackSettings, OfflineModeSettings } from "@/components/Profile";
import { PasswordRecoverySection } from "@/components/PasswordRecoverySection";
import { hapticError, hapticSuccess } from "@/utils/haptics";

const MAX_AVATAR_DATA_URL_CHARS = 450_000;

function currentIncomingSoundLabel(s: NotificationSettings): string {
  if (s.incomingMessageSoundDataUrl && s.incomingMessageSoundFileName) {
    return `Сейчас: ${s.incomingMessageSoundFileName}`;
  }
  if (s.incomingMessageSoundAssetPath) {
    const p = incomingSoundPresetByAssetPath(s.incomingMessageSoundAssetPath);
    return p ? `Сейчас: ${p.label}` : "Сейчас: выбранный звук";
  }
  return "Сейчас: встроенный короткий сигнал";
}

const OTHER_SECTIONS: { id: string; title: string; description: string }[] = [
  {
    id: "settings-security",
    title: "Безопасность",
    description: "Пароль, восстановление доступа",
  },
  {
    id: "settings-theme",
    title: "Тема",
    description: "Тёмная, светлая …",
  },
  {
    id: "settings-memory",
    title: "Память",
    description: "Кэш и локальные данные на этом устройстве.",
  },
];

function IconSectionAvatar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
      />
    </svg>
  );
}

function IconSectionNotify({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6V11c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
      />
    </svg>
  );
}

function IconSectionGeolocation({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
      />
    </svg>
  );
}

function IconSectionChat({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
      />
    </svg>
  );
}

function IconSectionSecurity({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v7.8z"
      />
    </svg>
  );
}

function IconSectionTheme({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z"
      />
    </svg>
  );
}

function IconSectionMemory({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"
      />
    </svg>
  );
}

function IconSectionHaptics({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M0 15h2V9H0v6zm3 2h2V7H3v10zm19-7v6h2V9h-2zm-3 7h2V7h-2v10zm-4-7.66l-1.41 1.41L15 9.83V20h2v-4.17l1.59 1.59L20 15l-4-4-3.33 3.34zM4 15h2V7H4v8z"
      />
    </svg>
  );
}

function IconSectionOffline({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7zm-1.5-4.5l6-6 1.41 1.41-6 6-2.5-2.5L8.91 12l1.59 1.5z"
      />
    </svg>
  );
}

function otherSectionIcon(id: string): ReactNode {
  switch (id) {
    case "settings-security":
      return <IconSectionSecurity className="admin-settings-section-trigger-icon-svg" />;
    case "settings-theme":
      return <IconSectionTheme className="admin-settings-section-trigger-icon-svg" />;
    case "settings-memory":
      return <IconSectionMemory className="admin-settings-section-trigger-icon-svg" />;
    default:
      return null;
  }
}

type SettingsAccordionItemProps = {
  sectionId: string;
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
  /** Иконка слева от заголовка (декоративная) */
  icon?: ReactNode;
  children: ReactNode;
};

function SettingsAccordionItem({
  sectionId,
  title,
  description,
  open,
  onToggle,
  className,
  icon,
  children,
}: SettingsAccordionItemProps) {
  const panelId = `${sectionId}-panel`;
  return (
    <div className={`admin-settings-collapsible${className ? ` ${className}` : ""}`.trim()}>
      <button
        type="button"
        className="admin-settings-section-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        id={sectionId}
        onClick={onToggle}
      >
        {icon ? (
          <span className="admin-settings-section-trigger-icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        <span className="admin-settings-section-trigger-text">
          <span className="admin-settings-section-trigger-title">{title}</span>
          {description.trim() ? (
            <span className="admin-settings-section-trigger-desc">{description}</span>
          ) : null}
        </span>
        <span className="admin-settings-section-trigger-chevron" aria-hidden>
          {open ? "▼" : "▶"}
        </span>
      </button>
      {open ? (
        <div
          className="admin-settings-section-panel"
          id={panelId}
          role="region"
          aria-labelledby={sectionId}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  );
}

function IconAddPhoto({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M3 4V1h2v3h3v2H5v3H3V6H0V4h3zm3 6V7h3V4h7l1.83 2H21c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V10h3zm7 9c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-3.2-5c0 1.77 1.43 3.2 3.2 3.2s3.2-1.43 3.2-3.2-1.43-3.2-3.2-3.2-3.2 1.43-3.2 3.2z"
      />
    </svg>
  );
}

function AppIconBadgeSettingsSection() {
  const [enabled, setEnabled] = useState(() => isBadgePreferenceEnabled());
  const diag = getBadgingDiagnostics();

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "startavto_app_badge_enabled") {
        setEnabled(isBadgePreferenceEnabled());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <div className="admin-settings-app-badge-panel">
      <h3 className="admin-settings-subtitle">Счётчик на иконке приложения</h3>
      <p className="admin-settings-section-desc">
        Для PWA на рабочем столе или домашнем экране число важных событий (чат, заявки, напоминания) может
        отображаться на иконке. Нужна установка приложения и поддержка Badging API в браузере.
      </p>
      {diag.platform === "ios" ? (
        <p className="admin-settings-section-desc admin-settings-app-badge-ios-hint">
          На iPhone и iPad (Safari) отображение счётчика на иконке чаще всего недоступно. На Android и в
          Chrome/Edge для Windows функция обычно работает после установки приложения.
        </p>
      ) : null}
      <div className="admin-settings-toggle-row">
        <div className="admin-settings-toggle-label" id="app-badge-toggle-label">
          Показывать счётчик на иконке
          <span className="admin-settings-toggle-hint">Локально в этом браузере; при выключении бейдж сбрасывается</span>
        </div>
        <label className="switch-stay">
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            onChange={(e) => {
              const v = e.target.checked;
              setBadgePreferenceEnabled(v);
              setEnabled(isBadgePreferenceEnabled());
              notifyBadgePreferenceChanged();
            }}
            aria-labelledby="app-badge-toggle-label"
            aria-checked={enabled}
          />
          <span className="switch-stay-slider" aria-hidden />
        </label>
      </div>
      <p className="admin-settings-section-desc admin-settings-app-badge-meta">
        Поддержка API на этом устройстве: {diag.supported ? "да" : "нет"} · платформа: {diag.platform}
      </p>
    </div>
  );
}

export function AdminSettingsTab() {
  const { user, profile, refreshProfile } = useAuth();
  const uid = user?.uid ?? "";
  const isAdmin = profile?.role === "admin";
  const isDriveGeoUser = profile?.role === "instructor" || profile?.role === "student";

  const [meetingGeoEnabled, setMeetingGeoEnabledState] = useState(true);
  const [geoPerm, setGeoPerm] = useState<BrowserGeolocationPermissionLabel>("prompt");
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);

  const [chatPrivacy, setChatPrivacy] = useState<ChatPrivacySettings>(DEFAULT_CHAT_PRIVACY_SETTINGS);
  const [chatLastSeenVisibility, setChatLastSeenVisibility] = useState<ChatLastSeenVisibilitySettings>(
    DEFAULT_CHAT_LAST_SEEN_VISIBILITY_SETTINGS
  );

  useEffect(() => {
    if (uid) setChatPrivacy(getChatPrivacySettings(uid));
    else setChatPrivacy(DEFAULT_CHAT_PRIVACY_SETTINGS);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return subscribeChatPrivacySettings(() => {
      setChatPrivacy(getChatPrivacySettings(uid));
    });
  }, [uid]);

  const toggleChatPrivacy = (key: keyof ChatPrivacySettings) => {
    if (!uid) return;
    const cur = getChatPrivacySettings(uid);
    const value = !cur[key];
    setChatPrivacySettings(uid, { [key]: value });
    setChatPrivacy({ ...cur, [key]: value });
  };

  useEffect(() => {
    return subscribeChatLastSeenVisibilitySettings(setChatLastSeenVisibility);
  }, []);

  const patchChatLastSeenVisibility = async (
    patch: Partial<ChatLastSeenVisibilitySettings>
  ) => {
    if (!isAdmin) return;
    const next = { ...chatLastSeenVisibility, ...patch };
    await setChatLastSeenVisibilitySettings(next);
    setChatLastSeenVisibility(next);
  };

  const [notifySettings, setNotifySettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS
  );
  const [notifyPerm, setNotifyPerm] = useState<BrowserNotifyPermissionLabel>(() =>
    getBrowserNotificationPermission()
  );

  useEffect(() => {
    if (uid) setNotifySettings(getNotificationSettings(uid));
    else setNotifySettings(DEFAULT_NOTIFICATION_SETTINGS);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return subscribeNotificationSettings(() => {
      setNotifySettings(getNotificationSettings(uid));
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setMeetingGeoEnabledState(true);
      return;
    }
    if (!isDriveGeoUser) return;
    setMeetingGeoEnabledState(getMeetingGeolocationEnabled(uid));
  }, [uid, isDriveGeoUser]);

  useEffect(() => {
    if (!uid || !isDriveGeoUser) return;
    return subscribeMeetingGeolocationSettings(() => {
      setMeetingGeoEnabledState(getMeetingGeolocationEnabled(uid));
    });
  }, [uid, isDriveGeoUser]);

  useEffect(() => {
    if (!isDriveGeoUser) return;
    let cancelled = false;
    let removePerm: (() => void) | undefined;
    const syncPerm = () => {
      void detectBrowserGeolocationPermission().then((p) => {
        if (!cancelled) setGeoPerm(p);
      });
    };
    syncPerm();
    window.addEventListener("focus", syncPerm);
    document.addEventListener("visibilitychange", syncPerm);
    window.addEventListener("pageshow", syncPerm);
    void (async () => {
      try {
        if (navigator.permissions?.query) {
          const st = await navigator.permissions.query({
            name: "geolocation" as PermissionName,
          });
          const onChange = () => {
            setGeoPerm(st.state as BrowserGeolocationPermissionLabel);
          };
          st.addEventListener("change", onChange);
          removePerm = () => st.removeEventListener("change", onChange);
        }
      } catch {
        /* Safari и др. */
      }
    })();
    return () => {
      cancelled = true;
      window.removeEventListener("focus", syncPerm);
      document.removeEventListener("visibilitychange", syncPerm);
      window.removeEventListener("pageshow", syncPerm);
      removePerm?.();
    };
  }, [isDriveGeoUser]);

  const incomingSoundInputRef = useRef<HTMLInputElement | null>(null);
  const [incomingSoundErr, setIncomingSoundErr] = useState<string | null>(null);
  const [incomingSoundListOpen, setIncomingSoundListOpen] = useState(false);

  useEffect(() => {
    if (!incomingSoundListOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIncomingSoundListOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [incomingSoundListOpen]);

  useEffect(() => {
    const sync = () => setNotifyPerm(getBrowserNotificationPermission());
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    let removePermListener: (() => void) | undefined;
    try {
      if (navigator.permissions?.query) {
        void navigator.permissions
          .query({ name: "notifications" as PermissionName })
          .then((status) => {
            status.addEventListener("change", sync);
            removePermListener = () => status.removeEventListener("change", sync);
          })
          .catch(() => {});
      }
    } catch {
      /* Safari: query может быть недоступен */
    }
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pageshow", sync);
      removePermListener?.();
    };
  }, []);

  const toggleNotify = (key: keyof NotificationSettings) => {
    if (!uid) return;
    const cur = getNotificationSettings(uid);
    const v = cur[key];
    if (typeof v !== "boolean") return;
    const next = !v;
    setNotificationSettings(uid, { [key]: next });
    setNotifySettings({ ...cur, [key]: next });
    if (key === "webPushEnabled" && next === false) {
      void removeAllFcmTokensForUser(uid);
    }
    if (key === "webPushEnabled" && next === true && hasFcmVapidConfigured()) {
      void registerWebPushAndSaveToken(uid);
    }
  };

  const setNotifyVolumePercent = (percent: number) => {
    if (!uid) return;
    const p = Math.min(100, Math.max(0, percent));
    setNotificationSettings(uid, { chatSoundVolume: p / 100 });
    setNotifySettings(getNotificationSettings(uid));
  };

  /**
   * Без async/await: на части мобильных браузеров цепочка user gesture обрывается,
   * и запрос разрешения не показывается или сразу даёт «запрещено».
   */
  const requestBrowserNotifications = () => {
    if (typeof Notification === "undefined") return;
    const req = Notification.requestPermission();
    void Promise.resolve(req).then(async () => {
      setNotifyPerm(getBrowserNotificationPermission());
      if (getBrowserNotificationPermission() === "granted" && uid && hasFcmVapidConfigured()) {
        await registerWebPushAndSaveToken(uid);
      }
    });
  };

  const [testPushBusy, setTestPushBusy] = useState(false);
  const [testPushResult, setTestPushResult] = useState<{ ok: boolean; text: string } | null>(null);

  const handleTestPush = useCallback(async () => {
    if (!uid) return;
    setTestPushBusy(true);
    setTestPushResult(null);
    try {
      if (
        notifySettings.webPushEnabled &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        hasFcmVapidConfigured()
      ) {
        await registerWebPushAndSaveToken(uid);
      }
      const r = await callSendTestPush();
      if (r.ok) {
        const n = r.devices;
        const tok =
          n % 10 === 1 && n % 100 !== 11
            ? "токен"
            : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)
              ? "токена"
              : "токенов";
        setTestPushResult({
          ok: true,
          text: `Отправлено на ${n} ${tok}. Проверьте системное уведомление (в том числе со свёрнутой вкладкой).`,
        });
      } else {
        setTestPushResult({ ok: false, text: r.message });
      }
    } catch (e) {
      setTestPushResult({
        ok: false,
        text: e instanceof Error ? e.message : "Не удалось отправить тест",
      });
    } finally {
      setTestPushBusy(false);
    }
  }, [uid, notifySettings.webPushEnabled]);

  const onMeetingGeolocationToggle = useCallback(
    (want: boolean) => {
      if (!uid || !isDriveGeoUser) return;
      if (!want) {
        setMeetingGeolocationEnabled(uid, false);
        setMeetingGeoEnabledState(false);
        setGeoErr(null);
        return;
      }
      if (!meetingGeolocationRequiresSecureContext()) {
        setGeoErr(
          "Нужен безопасный адрес (HTTPS или localhost), иначе браузер не выдаёт доступ к геолокации."
        );
        return;
      }
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setGeoErr("Геолокация не поддерживается в этом браузере.");
        return;
      }
      setGeoBusy(true);
      setGeoErr(null);
      navigator.geolocation.getCurrentPosition(
        () => {
          setMeetingGeolocationEnabled(uid, true);
          setMeetingGeoEnabledState(true);
          setGeoBusy(false);
          void detectBrowserGeolocationPermission().then(setGeoPerm);
        },
        (err) => {
          setMeetingGeolocationEnabled(uid, false);
          setMeetingGeoEnabledState(false);
          setGeoBusy(false);
          const msg =
            err.code === 1
              ? "Доступ к геолокации запрещён. Разрешите в настройках браузера или для этого сайта."
              : err.code === 2
                ? "Позиция временно недоступна. Повторите позже."
                : err.code === 3
                  ? "Истекло время ожидания координат. Проверьте сигнал GPS или сеть."
                  : err.message || "Не удалось получить координаты.";
          setGeoErr(msg);
        },
        { enableHighAccuracy: false, maximumAge: 0, timeout: 25_000 }
      );
    },
    [uid, isDriveGeoUser]
  );

  const onPickIncomingSoundFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !uid) return;
    setIncomingSoundErr(null);
    if (f.size > MAX_INCOMING_SOUND_FILE_BYTES) {
      setIncomingSoundErr("Файл слишком большой (макс. ~400 КБ). Выберите более короткий звук.");
      return;
    }
    if (!f.type.startsWith("audio/") && !/\.(mp3|m4a|aac|ogg|wav|webm|flac)$/i.test(f.name)) {
      setIncomingSoundErr("Выберите аудиофайл.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result;
      if (typeof data !== "string") return;
      if (data.length > MAX_INCOMING_SOUND_DATA_URL_CHARS) {
        setIncomingSoundErr(
          "После конвертации файл слишком большой для сохранения. Выберите файл меньшего размера."
        );
        return;
      }
      setNotificationSettings(uid, {
        incomingMessageSoundDataUrl: data,
        incomingMessageSoundFileName: f.name,
        incomingMessageSoundAssetPath: null,
      });
      setNotifySettings(getNotificationSettings(uid));
    };
    reader.onerror = () => setIncomingSoundErr("Не удалось прочитать файл.");
    reader.readAsDataURL(f);
  };

  const clearIncomingSoundFile = () => {
    if (!uid) return;
    setIncomingSoundErr(null);
    setNotificationSettings(uid, {
      incomingMessageSoundDataUrl: null,
      incomingMessageSoundFileName: null,
      incomingMessageSoundAssetPath: null,
    });
    setNotifySettings(getNotificationSettings(uid));
  };

  const selectIncomingSoundPreset = (path: string) => {
    if (!uid) return;
    setIncomingSoundErr(null);
    setNotificationSettings(uid, {
      incomingMessageSoundAssetPath: path,
      incomingMessageSoundDataUrl: null,
      incomingMessageSoundFileName: null,
    });
    setNotifySettings(getNotificationSettings(uid));
    setIncomingSoundListOpen(false);
  };

  const previewIncomingSound = () => {
    playIncomingMessageSound(
      notifySettings.chatSoundVolume,
      notifySettings.incomingMessageSoundDataUrl,
      notifySettings.incomingMessageSoundAssetPath
    );
  };

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imgReady, setImgReady] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarScale, setAvatarScale] = useState(1.2);
  const [busy, setBusy] = useState(false);

  const [firebaseMemOpen, setFirebaseMemOpen] = useState(false);
  const [firebaseMemSnap, setFirebaseMemSnap] = useState<ChatFirestoreMemorySnapshot | null>(null);
  const [firebaseMemLoading, setFirebaseMemLoading] = useState(false);
  const [firebaseMemErr, setFirebaseMemErr] = useState<string | null>(null);
  const [firebaseMemNames, setFirebaseMemNames] = useState<Map<string, string>>(new Map());
  const [firebaseMemPurgeKey, setFirebaseMemPurgeKey] = useState<string | null>(null);

  const refreshFirebaseMemory = useCallback(async () => {
    if (!isAdmin) return;
    setFirebaseMemLoading(true);
    setFirebaseMemErr(null);
    try {
      const snap = await fetchChatFirestoreMemorySnapshot();
      setFirebaseMemSnap(snap);
      const names = await fetchUserDisplayNamesForAdmin(snap.byUser.map((u) => u.uid));
      setFirebaseMemNames(names);
    } catch (e: unknown) {
      setFirebaseMemSnap(null);
      setFirebaseMemErr(e instanceof Error ? e.message : "Не удалось загрузить данные");
    } finally {
      setFirebaseMemLoading(false);
    }
  }, [isAdmin]);

  const runPurge = async (uid: string, category: ChatMemoryPurgeCategory) => {
    if (!isAdmin) return;
    const labels: Record<ChatMemoryPurgeCategory, string> = {
      image_file: "файлы и фото",
      voice: "голосовые сообщения",
      text: "текстовые сообщения",
    };
    if (
      !window.confirm(
        `Удалить у всех ${labels[category]} этого пользователя в чатах? Данные в Firestore будут очищены.`
      )
    ) {
      return;
    }
    const key = `${uid}:${category}`;
    setFirebaseMemPurgeKey(key);
    setFirebaseMemErr(null);
    try {
      await adminPurgeUserChatDataInFirestore(uid, category);
      await refreshFirebaseMemory();
    } catch (e: unknown) {
      setFirebaseMemErr(e instanceof Error ? e.message : "Ошибка очистки");
    } finally {
      setFirebaseMemPurgeKey(null);
    }
  };
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [openSettingsSection, setOpenSettingsSection] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getTheme());

  useEffect(() => {
    return subscribeTheme(() => setThemeMode(getTheme()));
  }, []);

  const toggleSettingsSection = (id: string) => {
    setOpenSettingsSection((prev) => (prev === id ? null : id));
  };

  useEffect(() => {
    if (profile?.avatarDataUrl) {
      setPreviewUrl(profile.avatarDataUrl);
      setImgReady(false);
    } else {
      setPreviewUrl(null);
      setImgReady(false);
    }
    setAvatarScale(1.2);
    setLocalErr(null);
    setSavedOk(false);
  }, [profile?.avatarDataUrl, profile?.uid]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) {
      setLocalErr("Выберите изображение");
      return;
    }
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    setImgReady(false);
    setLocalErr(null);
    setSavedOk(false);
  };

  const clearLocalAvatar = () => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImgReady(false);
    setLocalErr(null);
    setSavedOk(false);
  };

  const handleSaveAvatar = async () => {
    if (!uid) {
      setLocalErr("Войдите в аккаунт.");
      return;
    }
    setBusy(true);
    setLocalErr(null);
    setSavedOk(false);
    try {
      if (!previewUrl) {
        await updateUserProfileFields(uid, { avatarDataUrl: null });
      } else {
        if (!imgRef.current || !imgReady) {
          setLocalErr("Дождитесь загрузки превью изображения.");
          setBusy(false);
          return;
        }
        const dataUrl = drawCircularAvatar(imgRef.current, avatarScale, AVATAR_EXPORT_SIZE);
        if (!dataUrl) throw new Error("Не удалось обработать изображение");
        if (dataUrl.length > MAX_AVATAR_DATA_URL_CHARS) {
          setLocalErr("Файл слишком большой после обработки. Выберите другое фото.");
          setBusy(false);
          return;
        }
        await updateUserProfileFields(uid, { avatarDataUrl: dataUrl });
      }
      await refreshProfile();
      setSavedOk(true);
      hapticSuccess();
    } catch (e: unknown) {
      setLocalErr(e instanceof Error ? e.message : "Не удалось сохранить аватар");
      hapticError();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-tab admin-settings-tab">
      <h1 className="admin-tab-title">Настройки</h1>
      <p className="admin-tab-lead">
        Персональные параметры приложения. Аватар сохраняется в профиле и отображается в чате и
        карточках для всех, кто видит ваш контакт.
      </p>

      <div className="admin-settings-sections">
        <SettingsAccordionItem
          sectionId="settings-avatar"
          title="Аватар"
          description="Загрузите снимок и подберите масштаб ползунком."
          open={openSettingsSection === "settings-avatar"}
          onToggle={() => toggleSettingsSection("settings-avatar")}
          icon={<IconSectionAvatar className="admin-settings-section-trigger-icon-svg" />}
        >
          {!uid ? (
            <p className="admin-settings-section-desc">Войдите, чтобы изменить аватар.</p>
          ) : (
            <>
              <div className="admin-settings-avatar-block chat-group-avatar-block">
                <div className="chat-group-avatar-preview-wrap">
                  <div className="chat-group-avatar-ring">
                    {previewUrl ? (
                      <img
                        ref={imgRef}
                        src={previewUrl}
                        alt=""
                        className="chat-group-avatar-img"
                        style={{ transform: `scale(${avatarScale})` }}
                        onLoad={() => setImgReady(true)}
                      />
                    ) : (
                      <div className="chat-group-avatar-placeholder">Нет фото</div>
                    )}
                  </div>
                </div>
                <div className="chat-group-avatar-controls">
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    className="chat-file-input"
                    onChange={onPickFile}
                    id="settings-user-avatar-file"
                  />
                  <button
                    type="button"
                    className="chat-ico-btn chat-group-avatar-upload-btn"
                    title="Загрузить фото"
                    aria-label="Загрузить фото"
                    disabled={busy}
                    onClick={() => avatarFileInputRef.current?.click()}
                  >
                    <IconAddPhoto className="chat-ico" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm admin-settings-avatar-remove"
                    disabled={busy || !previewUrl}
                    onClick={clearLocalAvatar}
                  >
                    Убрать фото
                  </button>
                  <div className="chat-group-scale">
                    <span className="chat-group-scale-label">Масштаб</span>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.05}
                      value={avatarScale}
                      onChange={(e) => setAvatarScale(Number(e.target.value))}
                      disabled={!previewUrl}
                      aria-label="Масштаб аватара в круге"
                    />
                  </div>
                </div>
              </div>

              <div className="admin-settings-avatar-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void handleSaveAvatar()}
                >
                  {busy ? "Сохранение…" : "Сохранить аватар"}
                </button>
              </div>

              {localErr ? (
                <div className="form-error admin-settings-avatar-err" role="alert">
                  {localErr}
                </div>
              ) : null}
              {savedOk && !localErr ? (
                <p className="admin-settings-saved-hint" role="status">
                  Аватар сохранён.
                </p>
              ) : null}
            </>
          )}
        </SettingsAccordionItem>

        <SettingsAccordionItem
          sectionId="settings-notify"
          title="Уведомления и звук"
          description="Push с сервера, звуки чата, уведомления браузера и вибрация. Настройки только на этом устройстве."
          open={openSettingsSection === "settings-notify"}
          onToggle={() => toggleSettingsSection("settings-notify")}
          icon={<IconSectionNotify className="admin-settings-section-trigger-icon-svg" />}
        >
          {!uid ? (
            <p className="admin-settings-section-desc">Войдите, чтобы изменить параметры.</p>
          ) : (
            <div className="admin-settings-notify-blocks" aria-label="Параметры уведомлений">
              <div className="admin-settings-policy-block">
                <h4 className="admin-settings-policy-heading">Push уведомления</h4>
                <p className="admin-settings-notify-perm-hint">
                  Сообщения, запись, свободные окна, вождение, талоны — в том числе когда вкладка в фоне. Нужен
                  разрешённый доступ в блоке «Уведомления браузера» ниже.
                </p>
                {!hasFcmVapidConfigured() ? (
                  <p className="admin-settings-notify-perm-warn" role="status">
                    На этой публикации сайта push с сервера не настроен (обратитесь к администратору). Для
                    разработки: в <code>.env</code> задайте <code>VITE_FIREBASE_VAPID_KEY</code>, пересоберите и
                    задеплойте.
                  </p>
                ) : null}
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="notify-web-push-label">
                    Получать на этом устройстве
                    <span className="admin-settings-toggle-hint">
                      Выкл — токен удаляется из облака для этого браузера.
                    </span>
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={notifySettings.webPushEnabled}
                      onChange={() => toggleNotify("webPushEnabled")}
                      aria-labelledby="notify-web-push-label"
                      aria-checked={notifySettings.webPushEnabled}
                      disabled={!hasFcmVapidConfigured()}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
              </div>

              <div className="admin-settings-policy-block">
                <h4 className="admin-settings-policy-heading">Звук</h4>
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="notify-sound-out-label">
                    Звук при отправке сообщения
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={notifySettings.soundOutgoingEnabled}
                      onChange={() => toggleNotify("soundOutgoingEnabled")}
                      aria-labelledby="notify-sound-out-label"
                      aria-checked={notifySettings.soundOutgoingEnabled}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="notify-sound-in-label">
                    Звук при входящем сообщении
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={notifySettings.soundIncomingEnabled}
                      onChange={() => toggleNotify("soundIncomingEnabled")}
                      aria-labelledby="notify-sound-in-label"
                      aria-checked={notifySettings.soundIncomingEnabled}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
                {notifySettings.soundIncomingEnabled ? (
                  <div className="admin-settings-incoming-sound-block">
                    <input
                      ref={incomingSoundInputRef}
                      type="file"
                      accept="audio/*,.mp3,.m4a,.aac,.ogg,.wav,.webm,.flac"
                      className="chat-file-input"
                      id="notify-incoming-sound-file"
                      aria-hidden
                      tabIndex={-1}
                      onChange={onPickIncomingSoundFile}
                    />
                    <div className="admin-settings-incoming-sound-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        aria-expanded={incomingSoundListOpen}
                        aria-controls="notify-incoming-sound-picker"
                        onClick={() => setIncomingSoundListOpen((o) => !o)}
                      >
                        Выбрать звук
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => previewIncomingSound()}
                      >
                        Прослушать
                      </button>
                      {notifySettings.incomingMessageSoundDataUrl ||
                      notifySettings.incomingMessageSoundAssetPath ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={clearIncomingSoundFile}
                        >
                          Стандартный сигнал
                        </button>
                      ) : null}
                    </div>
                    {incomingSoundListOpen ? (
                      <div
                        className="admin-settings-incoming-sound-picker"
                        id="notify-incoming-sound-picker"
                        role="listbox"
                        aria-label="Звуки входящего сообщения"
                      >
                        <ul className="admin-settings-incoming-sound-picker-list">
                          {INCOMING_SOUND_PRESETS.map((p) => {
                            const path = incomingSoundPresetAssetPath(p);
                            const selected =
                              notifySettings.incomingMessageSoundAssetPath === path;
                            return (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  className={`admin-settings-incoming-sound-picker-item${
                                    selected ? " is-selected" : ""
                                  }`.trim()}
                                  onClick={() => selectIncomingSoundPreset(path)}
                                >
                                  {p.label}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                        <div className="admin-settings-incoming-sound-picker-footer">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setIncomingSoundListOpen(false);
                              incomingSoundInputRef.current?.click();
                            }}
                          >
                            Свой файл…
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setIncomingSoundListOpen(false)}
                          >
                            Закрыть
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <p className="admin-settings-toggle-hint admin-settings-incoming-sound-hint">
                      Выберите один из встроенных звуков или укажите свой аудиофайл с устройства.
                    </p>
                    <p className="admin-settings-incoming-sound-file-name" role="status">
                      {currentIncomingSoundLabel(notifySettings)}
                    </p>
                    {incomingSoundErr ? (
                      <div className="form-error admin-settings-incoming-sound-err" role="alert">
                        {incomingSoundErr}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="admin-settings-volume-row">
                  <label className="admin-settings-volume-label" htmlFor="notify-chat-volume">
                    Громкость чат-звуков
                    <span className="admin-settings-toggle-hint">
                      Общий уровень для отправки и входящих сигналов
                    </span>
                  </label>
                  <div className="admin-settings-volume-control">
                    <input
                      id="notify-chat-volume"
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(notifySettings.chatSoundVolume * 100)}
                      onChange={(e) => setNotifyVolumePercent(Number(e.target.value))}
                      aria-valuetext={`${Math.round(notifySettings.chatSoundVolume * 100)}%`}
                    />
                    <span className="admin-settings-volume-value" aria-hidden>
                      {Math.round(notifySettings.chatSoundVolume * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="admin-settings-policy-block">
                <h4 className="admin-settings-policy-heading">Уведомления браузера</h4>
                <p className="admin-settings-notify-perm-hint">
                  Чтобы показывать уведомления вне вкладки, браузер и система должны разрешить доступ.
                  При отказе включите уведомления в настройках сайта или ОС.
                </p>
                {!notificationsRequireSecureContext() ? (
                  <p className="admin-settings-notify-perm-warn" role="status">
                    Откройте сайт по HTTPS (или localhost) — иначе браузер не даст запросить уведомления.
                  </p>
                ) : null}
                <div className="admin-settings-notify-perm-row">
                  <span className="admin-settings-notify-perm-status" role="status">
                    Статус: <strong>{browserNotifyPermissionRu(notifyPerm)}</strong>
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={notifyPerm === "granted" || notifyPerm === "unsupported"}
                    onClick={requestBrowserNotifications}
                  >
                    {notifyPerm === "granted"
                      ? "Уже включено"
                      : notifyPerm === "denied"
                        ? "Проверить снова"
                        : "Включить"}
                  </button>
                </div>
                {hasFcmVapidConfigured() ? (
                  <div className="admin-settings-test-push-block">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={testPushBusy || !notifySettings.webPushEnabled || !uid}
                      onClick={() => void handleTestPush()}
                    >
                      {testPushBusy ? "Отправка…" : "Тест push"}
                    </button>
                    <p className="admin-settings-toggle-hint admin-settings-test-push-hint">
                      Проверка доставки на это устройство (сообщения, запись, вождение и др.). Сначала включите
                      «Получать на этом устройстве» в блоке «Push уведомления» выше, затем разрешите уведомления
                      браузером.
                    </p>
                    {testPushResult ? (
                      <p
                        className={
                          testPushResult.ok
                            ? "admin-settings-saved-hint admin-settings-test-push-feedback"
                            : "form-error admin-settings-test-push-feedback"
                        }
                        role="status"
                      >
                        {testPushResult.text}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {notifyPerm === "denied" ? (
                  <details className="admin-settings-notify-denied-help">
                    <summary className="admin-settings-notify-denied-summary">
                      Как разрешить уведомления на телефоне
                    </summary>
                    <div className="admin-settings-notify-denied-body">
                      <p>
                        После отказа кнопка «Проверить снова» не открывает окно запроса — нужно включить
                        уведомления вручную в настройках браузера или системы, затем вернитесь на эту
                        страницу (статус обновится).
                      </p>
                      <p>
                        <strong>Chrome / Android:</strong> меню браузера (⋮) → «Сведения о сайте» или
                        «Настройки сайта» → Уведомления → разрешить для этого сайта. Либо: Настройки Android
                        → Приложения → Chrome → Уведомления.
                      </p>
                      <p>
                        <strong>Safari / iPhone:</strong> «Настройки» iOS → Safari → внизу «Настройки для
                        веб-сайтов» → Уведомления — либо «Настройки» → уведомления для конкретного сайта,
                        если браузер их показывает. В iOS веб-уведомления часто доступны только для сайта,
                        добавленного на экран «Домой» (PWA); в обычной вкладке Safari возможности могут быть
                        ограничены.
                      </p>
                    </div>
                  </details>
                ) : null}
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="notify-bg-only-label">
                    Только когда вкладка в фоне
                    <span className="admin-settings-toggle-hint">
                      Не показывать системное уведомление, пока окно на переднем плане
                    </span>
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={notifySettings.browserNotifyOnlyWhenBackground}
                      onChange={() => toggleNotify("browserNotifyOnlyWhenBackground")}
                      aria-labelledby="notify-bg-only-label"
                      aria-checked={notifySettings.browserNotifyOnlyWhenBackground}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="notify-preview-label">
                    Превью текста в уведомлении
                    <span className="admin-settings-toggle-hint">
                      Иначе — только заголовок и название чата без текста сообщения
                    </span>
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={notifySettings.browserNotifyShowMessagePreview}
                      onChange={() => toggleNotify("browserNotifyShowMessagePreview")}
                      aria-labelledby="notify-preview-label"
                      aria-checked={notifySettings.browserNotifyShowMessagePreview}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
              </div>

              <div className="admin-settings-policy-block">
                <h4 className="admin-settings-policy-heading">Вибрация</h4>
                <VibrationIncomingSettingRow />
              </div>

              <div className="admin-settings-policy-block">
                <h4 className="admin-settings-policy-heading">Режим «не беспокоить»</h4>
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="notify-dnd-label">
                    Тихие часы
                    <span className="admin-settings-toggle-hint">
                      В этот интервал отключаются звук входящих, вибрация и всплывающие уведомления (интерфейс
                      чата без изменений)
                    </span>
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={notifySettings.doNotDisturbEnabled}
                      onChange={() => toggleNotify("doNotDisturbEnabled")}
                      aria-labelledby="notify-dnd-label"
                      aria-checked={notifySettings.doNotDisturbEnabled}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
                {notifySettings.doNotDisturbEnabled ? (
                  <div className="admin-settings-dnd-times">
                    <label className="admin-settings-dnd-field">
                      <span className="admin-settings-dnd-field-label">С</span>
                      <input
                        type="time"
                        className="input admin-settings-time-input"
                        value={minutesToTimeInputValue(notifySettings.doNotDisturbStartMinutes)}
                        onChange={(e) => {
                          if (!uid) return;
                          setNotificationSettings(uid, {
                            doNotDisturbStartMinutes: timeInputValueToMinutes(e.target.value),
                          });
                          setNotifySettings(getNotificationSettings(uid));
                        }}
                      />
                    </label>
                    <label className="admin-settings-dnd-field">
                      <span className="admin-settings-dnd-field-label">До</span>
                      <input
                        type="time"
                        className="input admin-settings-time-input"
                        value={minutesToTimeInputValue(notifySettings.doNotDisturbEndMinutes)}
                        onChange={(e) => {
                          if (!uid) return;
                          setNotificationSettings(uid, {
                            doNotDisturbEndMinutes: timeInputValueToMinutes(e.target.value),
                          });
                          setNotifySettings(getNotificationSettings(uid));
                        }}
                      />
                    </label>
                    <span className="admin-settings-dnd-wrap-hint">
                      Интервал может переходить через полночь (например 22:00–07:00).
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </SettingsAccordionItem>

        <SettingsAccordionItem
          sectionId="settings-haptics"
          title="Тактильная отдача"
          description="Вибрация на Android, звуки на iOS при нажатиях."
          open={openSettingsSection === "settings-haptics"}
          onToggle={() => toggleSettingsSection("settings-haptics")}
          icon={<IconSectionHaptics className="admin-settings-section-trigger-icon-svg" />}
        >
          {!uid ? (
            <p className="admin-settings-section-desc">Войдите, чтобы изменить параметры.</p>
          ) : (
            <HapticFeedbackSettings />
          )}
        </SettingsAccordionItem>

        <SettingsAccordionItem
          sectionId="settings-offline"
          title="Офлайн-режим"
          description="Кэш страницы, данных и карты; работа без сети."
          open={openSettingsSection === "settings-offline"}
          onToggle={() => toggleSettingsSection("settings-offline")}
          icon={<IconSectionOffline className="admin-settings-section-trigger-icon-svg" />}
        >
          {!uid ? (
            <p className="admin-settings-section-desc">Войдите, чтобы изменить параметры.</p>
          ) : (
            <OfflineModeSettings />
          )}
        </SettingsAccordionItem>

        {isDriveGeoUser ? (
          <SettingsAccordionItem
            sectionId="settings-geolocation"
            title="Геолокация"
            description="Место встречи с инструктором или курсантом на карте."
            open={openSettingsSection === "settings-geolocation"}
            onToggle={() => toggleSettingsSection("settings-geolocation")}
            icon={<IconSectionGeolocation className="admin-settings-section-trigger-icon-svg" />}
          >
            {!uid ? (
              <p className="admin-settings-section-desc">Войдите, чтобы изменить параметры.</p>
            ) : (
              <div className="admin-settings-policy-block" aria-label="Геолокация для вождения">
                <p className="admin-settings-section-desc">
                  Необходима для указания места встречи инструктора с курсантом, отображения на карте и
                  сопутствующих функций. Включите переключатель — браузер запросит доступ к геолокации на
                  этом устройстве.
                </p>
                {!meetingGeolocationRequiresSecureContext() ? (
                  <p className="admin-settings-notify-perm-warn" role="status">
                    Откройте сайт по HTTPS (или localhost при разработке) — иначе геолокация в браузере
                    недоступна.
                  </p>
                ) : null}
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="drive-geo-enabled-label">
                    Разрешить геолокацию для приложения
                    <span className="admin-settings-toggle-hint">
                      Выкл — координаты не запрашиваются, передача места встречи с этого устройства
                      отключена.
                    </span>
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={meetingGeoEnabled}
                      disabled={geoBusy}
                      onChange={(e) => onMeetingGeolocationToggle(e.target.checked)}
                      aria-labelledby="drive-geo-enabled-label"
                      aria-checked={meetingGeoEnabled}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
                {geoBusy ? (
                  <p className="admin-settings-saved-hint" role="status">
                    Запрос доступа к геолокации…
                  </p>
                ) : null}
                <p className="admin-settings-notify-perm-hint" role="status">
                  Статус в браузере: {browserGeolocationPermissionRu(geoPerm)}.
                </p>
                {geoErr ? (
                  <p className="form-error admin-settings-avatar-err" role="alert">
                    {geoErr}
                  </p>
                ) : null}
                {geoPerm === "denied" ? (
                  <p className="admin-settings-notify-perm-warn" role="status">
                    Доступ к геолокации для сайта сейчас запрещён. Разрешите его в настройках браузера
                    (см. инструкцию ниже), затем снова включите переключатель.
                  </p>
                ) : null}

                <details className="admin-settings-notify-denied-help admin-settings-geo-browser-help">
                  <summary className="admin-settings-notify-denied-summary">
                    Как включить геолокацию в браузере
                  </summary>
                  <div className="admin-settings-notify-denied-body">
                    <p>
                      Сайт должен открываться по защищённому адресу (HTTPS). На телефоне в настройках
                      системы должны быть включены службы определения местоположения (GPS / геоданные).
                    </p>
                    <p>
                      <strong>Google Chrome (компьютер):</strong> значок замка или «Настройки сайта»
                      слева от адреса → «Местоположение» → «Разрешить». Либо меню ⋮ → «Настройки» →
                      «Конфиденциальность и безопасность» → «Настройки сайта» → «Местоположение» →
                      разрешить для нужного сайта или снять блокировку.
                    </p>
                    <p>
                      <strong>Google Chrome (Android):</strong> значок замка или «i» в адресной строке
                      → «Разрешения» / «Настройки сайта» → «Местоположение» → «Разрешить». При необходимости:
                      «Настройки» Android → «Местоположение» — включить и разрешить доступ для Chrome.
                    </p>
                    <p>
                      <strong>Safari (iPhone, iPad):</strong> «Настройки» → «Safari» → «Веб-сайты» →
                      «Геолокация» — выберите сайт и «Разрешить» или «Спрашивать». Также: «Настройки» →
                      «Конфиденциальность и безопасность» → «Службы геолокации» — должны быть включены;
                      для Safari при необходимости отдельно разрешите доступ к геолокации.
                    </p>
                    <p>
                      <strong>Safari (Mac):</strong> Safari → «Настройки» → «Веб-сайты» → слева
                      «Геолокация» — для вашего сайта выберите «Разрешить» или «Спрашивать». В macOS:
                      «Системные настройки» → «Конфиденциальность и безопасность» → «Службы геолокации»
                      — разрешите Safari (и при необходимости браузер целиком).
                    </p>
                    <p>
                      <strong>Яндекс Браузер:</strong> значок замка в адресной строке → настройки сайта
                      → разрешить «Доступ к местоположению». Либо меню → «Настройки» → «Сайты» →
                      «Доступ к местоположению».
                    </p>
                    <p>
                      После изменения настроек обновите страницу приложения и снова включите переключатель
                      «Разрешить геолокацию для приложения» выше.
                    </p>
                  </div>
                </details>
              </div>
            )}
          </SettingsAccordionItem>
        ) : null}

        <SettingsAccordionItem
          sectionId="settings-chat"
          title="Чат"
          description=""
          open={openSettingsSection === "settings-chat"}
          onToggle={() => toggleSettingsSection("settings-chat")}
          icon={<IconSectionChat className="admin-settings-section-trigger-icon-svg" />}
        >
          {isAdmin ? (
            <div
              className="admin-settings-chat-privacy"
              aria-labelledby="settings-chat-privacy-title"
            >
              <h3 className="admin-settings-subtitle" id="settings-chat-privacy-title">
                Приватность и безопасность
              </h3>

              <div className="admin-settings-policy-block">
                <h4 className="admin-settings-policy-heading">Статус «в сети» и активность</h4>
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="chat-privacy-share-online-label">
                    Публиковать для контактов «в сети»
                    <span className="admin-settings-toggle-hint">
                      Обновление heartbeat в Firestore, пока приложение открыто
                    </span>
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={chatPrivacy.shareOnlineWithContacts}
                      onChange={() => toggleChatPrivacy("shareOnlineWithContacts")}
                      aria-labelledby="chat-privacy-share-online-label"
                      aria-checked={chatPrivacy.shareOnlineWithContacts}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="chat-privacy-stale-label">
                    Считать «не в сети» без heartbeat ~3 мин
                    <span className="admin-settings-toggle-hint">
                      Если выключено, статус может дольше оставаться «в сети» по данным профиля
                    </span>
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={chatPrivacy.treatStaleHeartbeatAsOffline}
                      onChange={() => toggleChatPrivacy("treatStaleHeartbeatAsOffline")}
                      aria-labelledby="chat-privacy-stale-label"
                      aria-checked={chatPrivacy.treatStaleHeartbeatAsOffline}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="chat-privacy-show-ui-label">
                    Показывать статус и точку в чате
                    <span className="admin-settings-toggle-hint">Список контактов и шапка диалога</span>
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={chatPrivacy.showPresenceInChatUi}
                      onChange={() => toggleChatPrivacy("showPresenceInChatUi")}
                      aria-labelledby="chat-privacy-show-ui-label"
                      aria-checked={chatPrivacy.showPresenceInChatUi}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
                <div className="admin-settings-toggle-row">
                  <div
                    className="admin-settings-toggle-label"
                    id="chat-last-seen-instructor-label"
                  >
                    Разрешить инструктору видеть «был в сети»
                    <span className="admin-settings-toggle-hint">
                      У контактов «курсант» и «инструктор» в списке и в шапке диалога
                    </span>
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={chatLastSeenVisibility.allowForInstructor}
                      onChange={() => {
                        void patchChatLastSeenVisibility({
                          allowForInstructor: !chatLastSeenVisibility.allowForInstructor,
                        });
                      }}
                      aria-labelledby="chat-last-seen-instructor-label"
                      aria-checked={chatLastSeenVisibility.allowForInstructor}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
                <div className="admin-settings-toggle-row">
                  <div
                    className="admin-settings-toggle-label"
                    id="chat-last-seen-student-label"
                  >
                    Разрешить курсанту видеть «был в сети»
                    <span className="admin-settings-toggle-hint">
                      У контактов «курсант» и «инструктор» в списке и в шапке диалога
                    </span>
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={chatLastSeenVisibility.allowForStudent}
                      onChange={() => {
                        void patchChatLastSeenVisibility({
                          allowForStudent: !chatLastSeenVisibility.allowForStudent,
                        });
                      }}
                      aria-labelledby="chat-last-seen-student-label"
                      aria-checked={chatLastSeenVisibility.allowForStudent}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
              </div>

              <div className="admin-settings-policy-block">
                <h4 className="admin-settings-policy-heading">Удаление сообщений</h4>
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="chat-privacy-del-me-label">
                    Пункт «Удалить у меня» в меню
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={chatPrivacy.allowDeleteForMeInMenu}
                      onChange={() => toggleChatPrivacy("allowDeleteForMeInMenu")}
                      aria-labelledby="chat-privacy-del-me-label"
                      aria-checked={chatPrivacy.allowDeleteForMeInMenu}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="chat-privacy-del-all-label">
                    Пункт «Удалить у всех» в меню
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={chatPrivacy.allowDeleteForAllInMenu}
                      onChange={() => toggleChatPrivacy("allowDeleteForAllInMenu")}
                      aria-labelledby="chat-privacy-del-all-label"
                      aria-checked={chatPrivacy.allowDeleteForAllInMenu}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="chat-privacy-confirm-label">
                    Подтверждать удаление
                    <span className="admin-settings-toggle-hint">Диалог перед удалением одного или пакета</span>
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={chatPrivacy.confirmBeforeDelete}
                      onChange={() => toggleChatPrivacy("confirmBeforeDelete")}
                      aria-labelledby="chat-privacy-confirm-label"
                      aria-checked={chatPrivacy.confirmBeforeDelete}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <p className="admin-settings-section-desc">
              Поведение переписки, черновики и отображение сообщений.
            </p>
          )}
        </SettingsAccordionItem>

        {OTHER_SECTIONS.map(({ id, title, description }) => (
          <SettingsAccordionItem
            key={id}
            sectionId={id}
            title={title}
            description={description}
            open={openSettingsSection === id}
            onToggle={() => toggleSettingsSection(id)}
            icon={otherSectionIcon(id)}
          >
            {id === "settings-security" ? (
              <>
                <PasswordRecoverySection />
                <div className="admin-settings-security-sep" aria-hidden />
                <AppIconBadgeSettingsSection />
              </>
            ) : id === "settings-theme" ? (
              <div className="admin-settings-theme-panel" aria-label="Выбор темы оформления">
                <p className="admin-settings-section-desc">
                  Активна только одна тема: включение другой отключает предыдущую. Настройка сохраняется в этом
                  браузере.
                </p>
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="theme-dark-label">
                    Тёмная тема
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={themeMode === "dark"}
                      onChange={(e) => setTheme(e.target.checked ? "dark" : "light")}
                      aria-labelledby="theme-dark-label"
                      aria-checked={themeMode === "dark"}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="theme-light-label">
                    Светлая тема
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={themeMode === "light"}
                      onChange={(e) => setTheme(e.target.checked ? "light" : "dark")}
                      aria-labelledby="theme-light-label"
                      aria-checked={themeMode === "light"}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
                <div className="admin-settings-toggle-row">
                  <div className="admin-settings-toggle-label" id="theme-purple-label">
                    Фиолетовая тема
                    <span className="admin-settings-toggle-hint">
                      Тёмный фон с сиреневыми акцентами и читаемым контрастом
                    </span>
                  </div>
                  <label className="switch-stay">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={themeMode === "purple"}
                      onChange={(e) => setTheme(e.target.checked ? "purple" : "dark")}
                      aria-labelledby="theme-purple-label"
                      aria-checked={themeMode === "purple"}
                    />
                    <span className="switch-stay-slider" aria-hidden />
                  </label>
                </div>
              </div>
            ) : id === "settings-memory" ? (
              isAdmin ? (
                <div className="admin-settings-memory-panel">
                  <p className="admin-settings-section-desc">
                    Локальный кэш и черновики чата хранятся в браузере на этом устройстве. Ниже — оценка объёма
                    данных сообщений в <strong>Firestore</strong> (текст и вложения в полях документов), не
                    считая служебные поля и индексы.
                  </p>
                  <div className="admin-settings-firebase-memory-block">
                    <button
                      type="button"
                      className="btn btn-secondary admin-settings-firebase-memory-toggle"
                      aria-expanded={firebaseMemOpen}
                      onClick={() => setFirebaseMemOpen((v) => !v)}
                    >
                      Память в Firebase
                      <span className="admin-settings-firebase-memory-chevron" aria-hidden>
                        {firebaseMemOpen ? " ▼" : " ▶"}
                      </span>
                    </button>
                    {firebaseMemOpen ? (
                      <div className="admin-settings-firebase-memory-inner">
                        {firebaseMemErr ? (
                          <p className="admin-settings-firebase-memory-err" role="alert">
                            {firebaseMemErr}
                          </p>
                        ) : null}
                        <div className="admin-settings-firebase-memory-actions">
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={firebaseMemLoading}
                            onClick={() => void refreshFirebaseMemory()}
                          >
                            {firebaseMemLoading ? "Загрузка…" : "Обновить"}
                          </button>
                          {firebaseMemSnap ? (
                            <span className="admin-settings-firebase-memory-meta">
                              Чатов: {firebaseMemSnap.chatCount} · сообщений (документов):{" "}
                              {firebaseMemSnap.messageCount}
                            </span>
                          ) : null}
                        </div>
                        {firebaseMemSnap ? (
                          <>
                            <div className="admin-settings-firebase-memory-total">
                              <div className="admin-settings-firebase-memory-total-label">
                                Оценка в Firestore:{" "}
                                <strong>{formatStorageBytes(firebaseMemSnap.totalBytes)}</strong> из{" "}
                                {formatStorageBytes(FIREBASE_CHAT_PLAN_BYTES)}
                              </div>
                              <div
                                className="admin-settings-firebase-memory-bar"
                                role="img"
                                aria-label={`Заполнено ${Math.min(100, Math.round((firebaseMemSnap.totalBytes / FIREBASE_CHAT_PLAN_BYTES) * 100))} процентов от плана 5 ГБ`}
                              >
                                <div
                                  className="admin-settings-firebase-memory-bar-fill"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      (firebaseMemSnap.totalBytes / FIREBASE_CHAT_PLAN_BYTES) * 100
                                    )}%`,
                                  }}
                                >
                                  {firebaseMemSnap.totalBytes > 0 ? (
                                    <div className="admin-settings-firebase-memory-bar-stack">
                                      {firebaseMemSnap.imageFileBytes > 0 ? (
                                        <div
                                          className="admin-settings-firebase-memory-bar-seg admin-settings-firebase-memory-bar-seg--media"
                                          style={{ flex: firebaseMemSnap.imageFileBytes }}
                                        />
                                      ) : null}
                                      {firebaseMemSnap.voiceBytes > 0 ? (
                                        <div
                                          className="admin-settings-firebase-memory-bar-seg admin-settings-firebase-memory-bar-seg--voice"
                                          style={{ flex: firebaseMemSnap.voiceBytes }}
                                        />
                                      ) : null}
                                      {firebaseMemSnap.textBytes > 0 ? (
                                        <div
                                          className="admin-settings-firebase-memory-bar-seg admin-settings-firebase-memory-bar-seg--text"
                                          style={{ flex: firebaseMemSnap.textBytes }}
                                        />
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <ul className="admin-settings-firebase-memory-legend">
                                <li>
                                  <span className="admin-settings-firebase-memory-dot admin-settings-firebase-memory-dot--media" />
                                  Файлы и фото: {formatStorageBytes(firebaseMemSnap.imageFileBytes)}
                                </li>
                                <li>
                                  <span className="admin-settings-firebase-memory-dot admin-settings-firebase-memory-dot--voice" />
                                  Голосовые: {formatStorageBytes(firebaseMemSnap.voiceBytes)}
                                </li>
                                <li>
                                  <span className="admin-settings-firebase-memory-dot admin-settings-firebase-memory-dot--text" />
                                  Текст: {formatStorageBytes(firebaseMemSnap.textBytes)}
                                </li>
                              </ul>
                            </div>
                            <h3 className="admin-settings-subtitle admin-settings-firebase-by-user-title">
                              По отправителям
                            </h3>
                            {firebaseMemSnap.byUser.length === 0 ? (
                              <p className="admin-settings-section-desc">Нет данных для отображения.</p>
                            ) : (
                              <ul className="admin-settings-firebase-user-list">
                                {firebaseMemSnap.byUser.map((u) => {
                                  const name = firebaseMemNames.get(u.uid) ?? u.uid;
                                  const row = (
                                    label: string,
                                    bytes: number,
                                    category: ChatMemoryPurgeCategory
                                  ) => {
                                    const pk = `${u.uid}:${category}`;
                                    const purging = firebaseMemPurgeKey === pk;
                                    return (
                                      <div className="admin-settings-firebase-user-row" key={category}>
                                        <span className="admin-settings-firebase-user-row-label">{label}</span>
                                        <span className="admin-settings-firebase-user-row-size">
                                          {formatStorageBytes(bytes)}
                                        </span>
                                        <button
                                          type="button"
                                          className="admin-settings-firebase-purge-btn"
                                          title="Очистить в Firestore"
                                          disabled={bytes <= 0 || purging || firebaseMemLoading}
                                          onClick={() => void runPurge(u.uid, category)}
                                        >
                                          {purging ? "…" : <IconTrash className="admin-settings-firebase-purge-ico" />}
                                        </button>
                                      </div>
                                    );
                                  };
                                  return (
                                    <li key={u.uid} className="admin-settings-firebase-user-card">
                                      <div className="admin-settings-firebase-user-name">{name}</div>
                                      <div className="admin-settings-firebase-user-rows">
                                        {row("Файлы и фото", u.imageFileBytes, "image_file")}
                                        {row("Голосовые сообщения", u.voiceBytes, "voice")}
                                        {row("Текстовые сообщения", u.textBytes, "text")}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </>
                        ) : !firebaseMemLoading ? (
                          <p className="admin-settings-section-desc">
                            Нажмите «Обновить», чтобы загрузить оценку из Firebase.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <ClientCacheClearPanel
                    showSubtitle
                    description={
                      <>
                        Удаляются сохранённые черновики переписок, очищаются sessionStorage и Cache Storage (если
                        используются). Вход в аккаунт, тема оформления и настройки уведомлений не затрагиваются.
                      </>
                    }
                  />
                </div>
              ) : (
                <div className="admin-settings-memory-panel">
                  <ClientCacheClearPanel
                    description={
                      <>
                        Черновики чатов и данные сессии вкладки хранятся локально в браузере. Тема, звуки уведомлений
                        и прочие настройки не удаляются.
                      </>
                    }
                  />
                </div>
              )
            ) : (
              <p className="admin-settings-section-desc admin-settings-section-desc--placeholder">
                Раздел в разработке.
              </p>
            )}
          </SettingsAccordionItem>
        ))}
      </div>
    </div>
  );
}
