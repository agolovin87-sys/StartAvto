import { useAuth } from "@/context/AuthContext";
import { useGlobalIncomingChatAlerts } from "@/chat/useGlobalIncomingChatAlerts";

/**
 * Входящие по всем чатам: звук/вибрация/браузерные уведомления работают и на «Главная»,
 * «Настройки», «График» и т.д., не только когда открыта вкладка «Чат»
 * (подписка на последнее сообщение по каждой комнате, см. useGlobalIncomingChatAlerts).
 */
export function GlobalIncomingChatAlerts() {
  const { user, profile } = useAuth();
  const viewerUid = (user?.uid ?? profile?.uid ?? "").trim() || null;
  useGlobalIncomingChatAlerts(viewerUid);
  return null;
}
