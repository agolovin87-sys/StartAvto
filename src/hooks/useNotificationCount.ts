import { collection, getCountFromServer, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { localDateKey } from "@/admin/scheduleFormat";
import { useAuth } from "@/context/AuthContext";
import { useBadgeExtra } from "@/context/BadgeExtraContext";
import { useChatUnread } from "@/context/ChatUnreadContext";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";
import {
  subscribeDriveSlotsForInstructor,
  subscribeDriveSlotsForStudent,
} from "@/firebase/drives";
import { useBadging } from "@/hooks/useBadging";
import type { DriveSlot } from "@/types";

const DRIVES = "driveSlots";

function countPendingConfirmation(slots: DriveSlot[]): number {
  return slots.filter((s) => s.status === "pending_confirmation").length;
}

/** Напоминание: есть запланированное занятие на сегодня (вклад в бейдж максимум 1). */
function todayScheduledReminder(slots: DriveSlot[]): number {
  const today = localDateKey();
  const has = slots.some((s) => s.status === "scheduled" && s.dateKey === today);
  return has ? 1 : 0;
}

/**
 * Агрегирует «важные» счётчики и обновляет App Badge.
 * Чат: непрочитанные из ChatUnreadContext.
 * Заявки: слоты pending_confirmation (по роли).
 * Админ: + непрочитанные GPS-пинги (через BadgeExtraContext) + число pending_confirmation по всей базе (poll 30 с).
 */
export function useNotificationCount() {
  const { user, profile } = useAuth();
  const uid = (user?.uid ?? "").trim();
  const role = profile?.role;
  const { totalUnread } = useChatUnread();
  const { adminGpsUnread } = useBadgeExtra();
  const { updateBadge } = useBadging();

  const [slots, setSlots] = useState<DriveSlot[]>([]);
  const [adminPendingSlots, setAdminPendingSlots] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!uid || !isFirebaseConfigured) {
      setSlots([]);
      return;
    }
    if (role === "student") {
      return subscribeDriveSlotsForStudent(uid, setSlots);
    }
    if (role === "instructor") {
      return subscribeDriveSlotsForInstructor(uid, setSlots);
    }
    setSlots([]);
    return () => {};
  }, [uid, role]);

  useEffect(() => {
    if (role !== "admin" || !isFirebaseConfigured) {
      setAdminPendingSlots(0);
      return;
    }
    let cancelled = false;
    async function poll() {
      try {
        const { db } = getFirebase();
        const q = query(
          collection(db, DRIVES),
          where("status", "==", "pending_confirmation")
        );
        const snap = await getCountFromServer(q);
        if (!cancelled) setAdminPendingSlots(snap.data().count);
      } catch {
        if (!cancelled) setAdminPendingSlots(0);
      }
    }
    void poll();
    const id = window.setInterval(() => {
      void poll();
      setTick((t) => t + 1);
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [role]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const pendingBookings = useMemo(() => countPendingConfirmation(slots), [slots]);

  const reminder = useMemo(() => {
    void tick;
    return todayScheduledReminder(slots);
  }, [slots, tick]);

  const total = useMemo(() => {
    let n = totalUnread + pendingBookings + reminder;
    if (role === "admin") {
      n += adminGpsUnread + adminPendingSlots;
    }
    return Math.min(99, n);
  }, [
    totalUnread,
    pendingBookings,
    reminder,
    role,
    adminGpsUnread,
    adminPendingSlots,
  ]);

  useEffect(() => {
    void updateBadge(total);
  }, [total, updateBadge]);

  return {
    total,
    chatUnread: totalUnread,
    pendingBookings,
    reminder,
    adminExtras: role === "admin" ? adminGpsUnread + adminPendingSlots : 0,
  };
}
