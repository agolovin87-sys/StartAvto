import { useEffect, useMemo, useRef, useState } from "react";
import { fetchDriveSlotsForStudent } from "@/firebase/drives";
import { fetchTalonHistoryForUser, type TalonHistoryEntry } from "@/firebase/history";
import { getUserProfile } from "@/firebase/users";
import type { DriveSlot } from "@/types";

function filterDriveHistorySlots(slots: DriveSlot[]): DriveSlot[] {
  return slots
    .filter((s) => s.status === "completed" || s.status === "cancelled")
    .sort((a, b) => {
      const dk = b.dateKey.localeCompare(a.dateKey);
      if (dk !== 0) return dk;
      return b.startTime.localeCompare(a.startTime, undefined, { numeric: true });
    });
}

/** Общая загрузка журнала талонов и слотов для вкладок «История» и «Билеты». */
export function useStudentHistoryData(studentUid: string) {
  const [entries, setEntries] = useState<TalonHistoryEntry[]>([]);
  const [driveSlots, setDriveSlots] = useState<DriveSlot[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [instructorNameById, setInstructorNameById] = useState<Record<string, string>>({});
  const loadedInstructorIdsRef = useRef<Set<string>>(new Set());

  const driveHistorySlots = useMemo(() => filterDriveHistorySlots(driveSlots), [driveSlots]);

  useEffect(() => {
    if (!studentUid) {
      setEntries([]);
      setDriveSlots([]);
      loadedInstructorIdsRef.current = new Set();
      setInstructorNameById({});
      setLoading(false);
      return;
    }

    loadedInstructorIdsRef.current = new Set();
    setInstructorNameById({});

    let cancelled = false;

    const load = async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const [tal, drives] = await Promise.all([
          fetchTalonHistoryForUser(studentUid),
          fetchDriveSlotsForStudent(studentUid),
        ]);
        if (cancelled) return;
        setEntries(tal);
        setDriveSlots(drives);
        setErr(null);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Не удалось загрузить данные";
        setErr(msg);
      } finally {
        if (!cancelled && !opts?.silent) setLoading(false);
      }
    };

    void load();

    const onVis = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      void load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [studentUid]);

  const historyInstructorIdsKey = useMemo(
    () =>
      [...new Set(driveHistorySlots.map((s) => s.instructorId).filter(Boolean))]
        .sort()
        .join("|"),
    [driveHistorySlots]
  );

  useEffect(() => {
    if (!historyInstructorIdsKey) return;
    const ids = historyInstructorIdsKey.split("|").filter(Boolean);
    const missing = ids.filter((id) => !loadedInstructorIdsRef.current.has(id));
    if (missing.length === 0) return;

    let cancelled = false;
    void (async () => {
      const results = await Promise.all(
        missing.map(async (id) => {
          try {
            const p = await getUserProfile(id);
            return [id, p?.displayName?.trim() ?? ""] as const;
          } catch {
            return [id, ""] as const;
          }
        })
      );
      if (cancelled) return;
      for (const [id] of results) {
        loadedInstructorIdsRef.current.add(id);
      }
      setInstructorNameById((prev) => {
        const next = { ...prev };
        for (const [id, name] of results) {
          next[id] = name;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [historyInstructorIdsKey]);

  return {
    entries,
    driveSlots,
    driveHistorySlots,
    err,
    loading,
    instructorNameById,
  };
}
