import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getNotificationSettings,
  isInDoNotDisturbPeriod,
} from "@/admin/notificationSettings";

const src = `${import.meta.env.BASE_URL}sounds/sentmessage.mp3`;

let cached: HTMLAudioElement | null = null;

/** Короткий звук после успешной отправки исходящего сообщения в чат. */
export function playOutgoingChatSound(uid?: string): void {
  if (typeof window === "undefined") return;
  const s = uid ? getNotificationSettings(uid) : DEFAULT_NOTIFICATION_SETTINGS;
  if (!s.soundOutgoingEnabled) return;
  if (isInDoNotDisturbPeriod(s)) return;
  const vol = Math.max(0, Math.min(1, s.chatSoundVolume));
  if (vol <= 0) return;
  try {
    if (!cached) {
      cached = new Audio(src);
      cached.preload = "auto";
    }
    cached.volume = vol;
    cached.currentTime = 0;
    void cached.play().catch(() => {});
  } catch {
    /* autoplay / разрешения */
  }
}
