import { useEffect } from "react";
import { useNotificationCount } from "@/hooks/useNotificationCount";
import { useBadging } from "@/hooks/useBadging";
import { BADGE_PREF_CHANGED_EVENT } from "@/utils/badging";
import { BadgeDebug } from "@/components/BadgeDebug";

/**
 * Держит бейдж в актуальном состоянии: счётчик из useNotificationCount + реакция на настройки и вкладку.
 */
export function AppBadgeCoordinator() {
  const { total } = useNotificationCount();
  const { updateBadge, badgeCount } = useBadging();

  useEffect(() => {
    const onPref = () => void updateBadge(total);
    window.addEventListener(BADGE_PREF_CHANGED_EVENT, onPref);
    return () => window.removeEventListener(BADGE_PREF_CHANGED_EVENT, onPref);
  }, [total, updateBadge]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void updateBadge(total);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [total, updateBadge]);

  useEffect(() => {
    if (badgeCount !== total) {
      void updateBadge(total);
    }
  }, [badgeCount, total, updateBadge]);

  return <BadgeDebug computedTotal={total} />;
}
