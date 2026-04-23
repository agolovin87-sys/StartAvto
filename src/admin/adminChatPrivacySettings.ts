/** Настройки приватности чата (админ), только на клиенте. */

export const CHAT_PRIVACY_SETTINGS_EVENT = "startavto:chat-privacy-settings";

function storageKey(uid: string): string {
  return `startavto_chat_privacy_${uid}`;
}

export type ChatPrivacySettings = {
  /** Публиковать в Firestore heartbeat «в сети». */
  shareOnlineWithContacts: boolean;
  /** Учитывать отсутствие heartbeat ~3 мин как «не в сети». */
  treatStaleHeartbeatAsOffline: boolean;
  /** Показывать в списке контактов и шапке статус и точку. */
  showPresenceInChatUi: boolean;
  /** Для инструктора: показывать «был в сети» у контактов курсант/инструктор. */
  showLastSeenForInstructorContacts: boolean;
  /** Показывать в меню «Удалить у меня». */
  allowDeleteForMeInMenu: boolean;
  /** Показывать в меню «Удалить у всех». */
  allowDeleteForAllInMenu: boolean;
  /** Запрашивать подтверждение перед удалением (одиночное и пакетное). */
  confirmBeforeDelete: boolean;
};

export const DEFAULT_CHAT_PRIVACY_SETTINGS: ChatPrivacySettings = {
  shareOnlineWithContacts: true,
  treatStaleHeartbeatAsOffline: true,
  showPresenceInChatUi: true,
  showLastSeenForInstructorContacts: true,
  allowDeleteForMeInMenu: true,
  allowDeleteForAllInMenu: true,
  confirmBeforeDelete: false,
};

export function getChatPrivacySettings(uid: string): ChatPrivacySettings {
  if (!uid) return { ...DEFAULT_CHAT_PRIVACY_SETTINGS };
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return { ...DEFAULT_CHAT_PRIVACY_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ChatPrivacySettings>;
    return { ...DEFAULT_CHAT_PRIVACY_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_CHAT_PRIVACY_SETTINGS };
  }
}

export function setChatPrivacySettings(
  uid: string,
  patch: Partial<ChatPrivacySettings>
): void {
  if (!uid) return;
  const next = { ...getChatPrivacySettings(uid), ...patch };
  localStorage.setItem(storageKey(uid), JSON.stringify(next));
  window.dispatchEvent(new Event(CHAT_PRIVACY_SETTINGS_EVENT));
}

export function subscribeChatPrivacySettings(listener: () => void): () => void {
  const on = () => listener();
  window.addEventListener(CHAT_PRIVACY_SETTINGS_EVENT, on);
  window.addEventListener("storage", on);
  return () => {
    window.removeEventListener(CHAT_PRIVACY_SETTINGS_EVENT, on);
    window.removeEventListener("storage", on);
  };
}
