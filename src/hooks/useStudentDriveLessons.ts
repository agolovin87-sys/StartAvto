import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeDriveSlotsForStudent } from "@/firebase/drives";
import { getUserProfile } from "@/firebase/users";
import type { DriveSlot } from "@/types";
import type { DrivingLesson } from "@/types/studentCabinet";
import {
  assembleDrivingLessons,
  loadLessonErrorsForSlots,
  fetchTripForSlot,
} from "@/services/studentCabinetService";
import type { Trip } from "@/types/tripHistory";

/**
 * Завершённые вождения курсанта с ошибками урока (для ЛК / истории без журнала талонов).
 */
export function useStudentDriveLessons(studentId: string | undefined) {
  const [slots, setSlots] = useState<DriveSlot[]>([]);
  const [instructorNameById, setInstructorNameById] = useState<Record<string, string>>({});
  const [errorsBySlot, setErrorsBySlot] = useState<Record<string, import("@/types/errorTemplate").LessonDriveError[]>>(
    {}
  );
  const [tripsBySlot, setTripsBySlot] = useState<Record<string, Trip | null>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedInstructorsRef = useRef<Set<string>>(new Set());

  const uid = studentId?.trim() ?? "";

  useEffect(() => {
    if (!uid) {
      setSlots([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeDriveSlotsForStudent(
      uid,
      (list) => {
        setSlots(list);
        setErr(null);
        setLoading(false);
      },
      (e) => {
        setErr(e.message);
        setLoading(false);
      }
    );
  }, [uid]);

  const completedIds = useMemo(
    () =>
      slots
        .filter((s) => s.status === "completed")
        .map((s) => s.id)
        .sort()
        .join(","),
    [slots]
  );

  useEffect(() => {
    if (!completedIds) {
      setErrorsBySlot({});
      setTripsBySlot({});
      return;
    }
    const ids = completedIds.split(",").filter(Boolean);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const errMap = await loadLessonErrorsForSlots(ids);
          setErrorsBySlot(errMap);
          const tripMap: Record<string, Trip | null> = {};
          let i = 0;
          for (const id of ids) {
            tripMap[id] = await fetchTripForSlot(id);
            i += 1;
            if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
          }
          setTripsBySlot(tripMap);
        } catch {
          /* офлайн */
        }
      })();
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [completedIds]);

  const instructorIdsKey = useMemo(
    () => [...new Set(slots.map((s) => s.instructorId).filter(Boolean))].sort().join("|"),
    [slots]
  );

  useEffect(() => {
    if (!instructorIdsKey) return;
    const ids = instructorIdsKey.split("|").filter(Boolean);
    const missing = ids.filter((id) => !loadedInstructorsRef.current.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const patch: Record<string, string> = {};
      for (const id of missing) {
        loadedInstructorsRef.current.add(id);
        try {
          const p = await getUserProfile(id);
          patch[id] = p?.displayName?.trim() ?? "";
        } catch {
          patch[id] = "";
        }
      }
      if (!cancelled) setInstructorNameById((prev) => ({ ...prev, ...patch }));
    })();
    return () => {
      cancelled = true;
    };
  }, [instructorIdsKey]);

  const lessons: DrivingLesson[] = useMemo(
    () => assembleDrivingLessons(slots, errorsBySlot, tripsBySlot, instructorNameById),
    [slots, errorsBySlot, tripsBySlot, instructorNameById]
  );

  return { lessons, errorsBySlot, loading, err };
}
