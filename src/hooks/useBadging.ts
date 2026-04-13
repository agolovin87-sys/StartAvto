import { useCallback, useEffect, useReducer, useState } from "react";
import {
  clearBadge as clearBadgeUtil,
  getCurrentBadge,
  isSupported,
  setBadge as setBadgeUtil,
  subscribeAppBadgeMirror,
} from "@/utils/badging";

export function useBadging() {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [supported] = useState(() => isSupported());

  useEffect(() => subscribeAppBadgeMirror(bump), [bump]);

  const badgeCount = getCurrentBadge();

  const syncFromMirror = useCallback(() => {
    bump();
  }, []);

  const updateBadge = useCallback(
    async (count: number) => {
      await setBadgeUtil(count);
      syncFromMirror();
    },
    [syncFromMirror]
  );

  const incrementBadge = useCallback(async () => {
    const next = Math.min(99, getCurrentBadge() + 1);
    await updateBadge(next);
  }, [updateBadge]);

  const decrementBadge = useCallback(async () => {
    const next = Math.max(0, getCurrentBadge() - 1);
    await updateBadge(next);
  }, [updateBadge]);

  const resetBadge = useCallback(async () => {
    await clearBadgeUtil();
    syncFromMirror();
  }, [syncFromMirror]);

  return {
    badgeCount,
    updateBadge,
    incrementBadge,
    decrementBadge,
    resetBadge,
    supported,
    refresh: syncFromMirror,
  };
}
