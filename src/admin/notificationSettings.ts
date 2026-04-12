/** Настройки уведомлений и звука (локально в браузере). */

import { isAllowedIncomingSoundAssetPath } from "@/admin/incomingSoundPresets";

/** Лимит data URL для своего звука входящего (символы), чтобы не переполнять localStorage. */
export const MAX_INCOMING_SOUND_DATA_URL_CHARS = 450_000;
/** Лимит размера файла до чтения в data URL (байты). */
export const MAX_INCOMING_SOUND_FILE_BYTES = 420_000;

export const NOTIFICATION_SETTINGS_EVENT = "startavto:notification-settings";

function storageKey(uid: string): string {
  return `startavto_notify_${uid}`;
}

export type NotificationSettings = {
  soundOutgoingEnabled: boolean;
  soundIncomingEnabled: boolean;
  /** Data URL аудио для входящего; null если не свой файл */
  incomingMessageSoundDataUrl: string | null;
  /** Имя файла для подписи в настройках */
  incomingMessageSoundFileName: string | null;
  /** Путь к встроенному пресету из `public/sounds/incoming/`; null если не пресет */
  incomingMessageSoundAssetPath: string | null;
  /** 0…1, общий уровень для чат-звуков */
  chatSoundVolume: number;
  /** Не показывать системное уведомление, пока вкладка на переднем плане */
  browserNotifyOnlyWhenBackground: boolean;
  /** Показывать фрагмент текста; иначе только заголовок и чат без текста сообщения */
  browserNotifyShowMessagePreview: boolean;
  vibrationIncomingEnabled: boolean;
  doNotDisturbEnabled: boolean;
  /** Минуты от полуночи 0…1439 */
  doNotDisturbStartMinutes: number;
  doNotDisturbEndMinutes: number;
  /**
   * Push (FCM): сохранять токен устройства и получать уведомления с сервера.
   * Выкл — токены удаляются из Firestore на этом устройстве.
   */
  webPushEnabled: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  soundOutgoingEnabled: true,
  soundIncomingEnabled: true,
  incomingMessageSoundDataUrl: null,
  incomingMessageSoundFileName: null,
  incomingMessageSoundAssetPath: null,
  chatSoundVolume: 1,
  browserNotifyOnlyWhenBackground: true,
  browserNotifyShowMessagePreview: false,
  vibrationIncomingEnabled: true,
  doNotDisturbEnabled: false,
  doNotDisturbStartMinutes: 22 * 60,
  doNotDisturbEndMinutes: 7 * 60,
  webPushEnabled: true,
};

function sanitizeIncomingSoundFields(s: NotificationSettings): void {
  if (
    s.incomingMessageSoundFileName != null &&
    typeof s.incomingMessageSoundFileName !== "string"
  ) {
    s.incomingMessageSoundFileName = null;
  }

  let assetOk = false;
  if (typeof s.incomingMessageSoundAssetPath === "string") {
    const t = s.incomingMessageSoundAssetPath.trim();
    if (t.length > 0 && isAllowedIncomingSoundAssetPath(t)) {
      s.incomingMessageSoundAssetPath = t;
      assetOk = true;
    } else {
      s.incomingMessageSoundAssetPath = null;
    }
  } else {
    s.incomingMessageSoundAssetPath = null;
  }

  const dataOk =
    typeof s.incomingMessageSoundDataUrl === "string" &&
    s.incomingMessageSoundDataUrl.length > 0 &&
    s.incomingMessageSoundDataUrl.length <= MAX_INCOMING_SOUND_DATA_URL_CHARS;

  if (!dataOk) {
    s.incomingMessageSoundDataUrl = null;
    s.incomingMessageSoundFileName = null;
  }

  if (dataOk) {
    s.incomingMessageSoundAssetPath = null;
  } else if (assetOk) {
    s.incomingMessageSoundDataUrl = null;
    s.incomingMessageSoundFileName = null;
  } else {
    s.incomingMessageSoundAssetPath = null;
  }
}

export function getNotificationSettings(uid: string): NotificationSettings {
  if (!uid) return { ...DEFAULT_NOTIFICATION_SETTINGS };
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
    const merged = { ...DEFAULT_NOTIFICATION_SETTINGS, ...parsed };
    merged.chatSoundVolume = clamp01(merged.chatSoundVolume);
    merged.doNotDisturbStartMinutes = clampMinutes(merged.doNotDisturbStartMinutes);
    merged.doNotDisturbEndMinutes = clampMinutes(merged.doNotDisturbEndMinutes);
    sanitizeIncomingSoundFields(merged);
    return merged;
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_NOTIFICATION_SETTINGS.chatSoundVolume;
  return Math.min(1, Math.max(0, n));
}

function clampMinutes(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const x = Math.floor(n) % (24 * 60);
  return x < 0 ? x + 24 * 60 : x;
}

export function setNotificationSettings(
  uid: string,
  patch: Partial<NotificationSettings>
): void {
  if (!uid) return;
  const next = { ...getNotificationSettings(uid), ...patch };
  next.chatSoundVolume = clamp01(next.chatSoundVolume);
  next.doNotDisturbStartMinutes = clampMinutes(next.doNotDisturbStartMinutes);
  next.doNotDisturbEndMinutes = clampMinutes(next.doNotDisturbEndMinutes);
  sanitizeIncomingSoundFields(next);
  localStorage.setItem(storageKey(uid), JSON.stringify(next));
  window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_EVENT));
}

export function subscribeNotificationSettings(listener: () => void): () => void {
  const on = () => listener();
  window.addEventListener(NOTIFICATION_SETTINGS_EVENT, on);
  window.addEventListener("storage", on);
  return () => {
    window.removeEventListener(NOTIFICATION_SETTINGS_EVENT, on);
    window.removeEventListener("storage", on);
  };
}

/** Активны ли «тихие часы» в момент `when` (локальное время устройства). */
export function isInDoNotDisturbPeriod(
  s: NotificationSettings,
  when: Date = new Date()
): boolean {
  if (!s.doNotDisturbEnabled) return false;
  const m = when.getHours() * 60 + when.getMinutes();
  const start = s.doNotDisturbStartMinutes;
  const end = s.doNotDisturbEndMinutes;
  if (start === end) return false;
  if (start < end) return m >= start && m < end;
  return m >= start || m < end;
}

export function minutesToTimeInputValue(totalMinutes: number): string {
  const m = clampMinutes(totalMinutes);
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function timeInputValueToMinutes(value: string): number {
  const [a, b] = value.split(":");
  const h = Number(a);
  const min = Number(b);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return 0;
  return clampMinutes(h * 60 + min);
}

export type BrowserNotifyPermissionLabel = "granted" | "denied" | "default" | "unsupported";

export function getBrowserNotificationPermission(): BrowserNotifyPermissionLabel {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  const p = Notification.permission;
  if (p === "granted" || p === "denied" || p === "default") return p;
  return "unsupported";
}

export function browserNotifyPermissionRu(
  p: BrowserNotifyPermissionLabel
): string {
  switch (p) {
    case "granted":
      return "Разрешено";
    case "denied":
      return "Запрещено";
    case "default":
      return "Не спрашивали";
    default:
      return "Не поддерживается";
  }
}

/** Безопасный контекст (HTTPS / localhost) нужен для запроса уведомлений. */
export function notificationsRequireSecureContext(): boolean {
  if (typeof window === "undefined") return true;
  return window.isSecureContext;
}

/**
 * Есть ли в браузере `navigator.vibrate` (без проверки «мобильности»).
 * Safari на iOS и все браузеры на iPhone (WebKit) обычно **не** реализуют Vibration API — вибрации из веба не будет.
 * Safari на macOS и десктоп без мотора — API часто отсутствует или бесполезен.
 */
export function isVibrationApiSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/**
 * Вибрация на входящие имеет смысл на телефонах/планшетах с тактильным откликом.
 * На обычном десктопе Vibration API обычно отсутствует или не даёт эффекта.
 */
export function isLikelyMobileVibrationDevice(): boolean {
  if (!isVibrationApiSupported()) {
    return false;
  }
  if (typeof window === "undefined") return true;
  try {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const noHover = window.matchMedia("(hover: none)").matches;
    const narrow = window.matchMedia("(max-width: 896px)").matches;
    return coarse || (noHover && narrow);
  } catch {
    return true;
  }
}
