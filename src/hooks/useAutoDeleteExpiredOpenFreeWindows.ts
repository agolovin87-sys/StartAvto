import { useEffect, useRef } from "react";
import { instructorDeleteFreeDriveWindow } from "@/firebase/drives";
import { isOpenFreeWindowUnbookedAndPastStart } from "@/lib/driveSlotTime";
import type { FreeDriveWindow } from "@/types";

/**
 * Удаляет из Firestore свободные окна со статусом `open`, у которых уже наступило время начала
 * и никто не забронировал (карточка исчезает у инструктора и курсанта).
 */
export function useAutoDeleteExpiredOpenFreeWindows(
  instructorUid: string,
  freeWindows: FreeDriveWindow[]
): void {
  const ref = useRef(freeWindows);
  ref.current = freeWindows;
  const deletingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!instructorUid) return;
    const tick = () => {
      const now = Date.now();
      for (const w of ref.current) {
        if (!isOpenFreeWindowUnbookedAndPastStart(w, now)) continue;
        if (deletingRef.current.has(w.id)) continue;
        deletingRef.current.add(w.id);
        void instructorDeleteFreeDriveWindow(w.id).finally(() => {
          deletingRef.current.delete(w.id);
        });
      }
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [instructorUid]);
}
