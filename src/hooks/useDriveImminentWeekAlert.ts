import { useCallback, useEffect, useRef } from "react";
import type { DriveSlot } from "@/types";
import { playDriveAlertSound } from "@/audio/playDriveAlertSound";
import { isDriveSlotImminentAttention } from "@/lib/driveSession";

/**
 * За минуту до планового начала подтверждённого слота (пока live не начат): один звук,
 * один раз прокрутка к карточке; пока условие выполняется — класс «imminent» на карточке (CSS).
 */
export function useDriveImminentWeekAlert(params: {
  weekScheduledSlots: DriveSlot[];
  nowMs: number;
  viewerUid: string | undefined;
  /** Например секция «Мой график» открыта и список в DOM. */
  enabled: boolean;
  /** Вызывается один раз при входе слота в окно «осталась 1 минута». */
  onImminentSlot?: (slot: DriveSlot) => void;
}) {
  const { weekScheduledSlots, nowMs, viewerUid, enabled, onImminentSlot } = params;

  const elementsRef = useRef(new Map<string, HTMLLIElement | null>());
  const refCallbacksRef = useRef(
    new Map<string, (el: HTMLLIElement | null) => void>()
  );
  const soundPlayed = useRef(new Set<string>());
  const scrolled = useRef(new Set<string>());

  const getListItemRef = useCallback((slotId: string) => {
    let cb = refCallbacksRef.current.get(slotId);
    if (!cb) {
      cb = (el: HTMLLIElement | null) => {
        if (el) elementsRef.current.set(slotId, el);
        else elementsRef.current.delete(slotId);
      };
      refCallbacksRef.current.set(slotId, cb);
    }
    return cb;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    for (const sl of weekScheduledSlots) {
      const ok = isDriveSlotImminentAttention(sl, nowMs);
      if (!ok) {
        soundPlayed.current.delete(sl.id);
        scrolled.current.delete(sl.id);
        continue;
      }
      if (!soundPlayed.current.has(sl.id)) {
        soundPlayed.current.add(sl.id);
        playDriveAlertSound(viewerUid);
        onImminentSlot?.(sl);
      }
      const node = elementsRef.current.get(sl.id);
      if (node && !scrolled.current.has(sl.id)) {
        scrolled.current.add(sl.id);
        requestAnimationFrame(() => {
          node.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        });
      }
    }
  }, [weekScheduledSlots, nowMs, viewerUid, enabled, onImminentSlot]);

  const isImminent = useCallback(
    (sl: DriveSlot) => isDriveSlotImminentAttention(sl, nowMs),
    [nowMs]
  );

  return { getListItemRef, isImminent };
}
