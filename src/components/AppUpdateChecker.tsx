import { useAppUpdate } from "@/hooks/useAppUpdate";

/**
 * Фоновая проверка версии и баннер обновления без обёртки всего приложения
 * (глобальный PullToRefresh ломал высоту в части WebView → белый экран).
 */
export function AppUpdateChecker() {
  useAppUpdate();
  return null;
}
