import {
  getNotificationSettings,
  isInDoNotDisturbPeriod,
} from "@/admin/notificationSettings";
import { playIncomingMessageSound } from "@/chat/incomingMessageAlerts";

/**
 * Звук при событиях записи/вождения (новое окно, бронь, подтверждение и т.п.).
 * Уважает «Звук входящих», громкость чата и «Не беспокоить» из настроек.
 */
export function playDriveAlertSound(viewerUid: string | undefined): void {
  const uid = viewerUid?.trim();
  if (!uid || typeof window === "undefined") return;
  const s = getNotificationSettings(uid);
  if (!s.soundIncomingEnabled) return;
  if (isInDoNotDisturbPeriod(s)) return;
  const vol = Math.max(0, Math.min(1, s.chatSoundVolume));
  if (vol <= 0) return;
  playIncomingMessageSound(vol, null, null);
}
