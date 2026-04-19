import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeDriveSlotsForStudent } from "@/firebase/drives";
import { isFirebaseConfigured } from "@/firebase/config";
import { getUserProfile } from "@/firebase/users";
import type { DriveSlot } from "@/types";
import type { DrivingLesson } from "@/types/studentCabinet";
import type { LessonDriveError } from "@/types/errorTemplate";
import {
  assembleDrivingLessons,
  buildDrivingLesson,
  fetchTripForSlot,
} from "@/services/studentCabinetService";
import { subscribeDriveSlotLessonErrors } from "@/services/errorTemplateService";
import type { Trip } from "@/types/tripHistory";

/**
 * Слоты курсанта, треки завершённых уроков и ошибки урока в реальном времени (Firestore `driveSlotLessonErrors`).
 */
export function useStudentDriveLessons(studentId: string | undefined) {
  const [slots, setSlots] = useState<DriveSlot[]>([]);
  const [instructorNameById, setInstructorNameById] = useState<Record<string, string>>({});
  const [errorsBySlot, setErrorsBySlot] = useState<Record<string, LessonDriveError[]>>({});
  const [tripsBySlot, setTripsBySlot] = useState<Record<string, Trip | null>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedInstructorsRef = useRef<Set<string>>(new Set());
  const errorsSubsRef = useRef<Map<string, () => void>>(new Map());

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

  /** Подписка на ошибки по каждому неотменённому слоту — обновления сразу после выбора инструктором. */
  useEffect(() => {
    if (!uid || !isFirebaseConfigured) {
      for (const unsub of errorsSubsRef.current.values()) unsub();
      errorsSubsRef.current.clear();
      setErrorsBySlot({});
      return;
    }

    const want = new Set(slots.filter((s) => s.status !== "cancelled").map((s) => s.id));

    for (const [sid, unsub] of [...errorsSubsRef.current.entries()]) {
      if (!want.has(sid)) {
        unsub();
        errorsSubsRef.current.delete(sid);
        setErrorsBySlot((prev) => {
          if (!(sid in prev)) return prev;
          const next = { ...prev };
          delete next[sid];
          return next;
        });
      }
    }

    for (const sid of want) {
      if (errorsSubsRef.current.has(sid)) continue;
      const unsub = subscribeDriveSlotLessonErrors(
        sid,
        (list) => {
          setErrorsBySlot((prev) => ({ ...prev, [sid]: list }));
        },
        () => {
          setErrorsBySlot((prev) => {
            if (!(sid in prev)) return prev;
            const next = { ...prev };
            delete next[sid];
            return next;
          });
        }
      );
      errorsSubsRef.current.set(sid, unsub);
    }

    return () => {
      for (const unsub of errorsSubsRef.current.values()) unsub();
      errorsSubsRef.current.clear();
    };
  }, [slots, uid]);

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
      setTripsBySlot({});
      return;
    }
    const ids = completedIds.split(",").filter(Boolean);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
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

  const completedLessons: DrivingLesson[] = useMemo(
    () => assembleDrivingLessons(slots, errorsBySlot, tripsBySlot, instructorNameById),
    [slots, errorsBySlot, tripsBySlot, instructorNameById]
  );

  /** Незавершённый урок с уже отмеченными ошибками — показываем в «Истории» сразу. */
  const previewLessons: DrivingLesson[] = useMemo(() => {
    return slots
      .filter((s) => s.status !== "cancelled" && s.status !== "completed")
      .filter((s) => (errorsBySlot[s.id]?.length ?? 0) > 0)
      .map((s) =>
        buildDrivingLesson(
          s,
          instructorNameById[s.instructorId] ?? "",
          errorsBySlot[s.id] ?? [],
          tripsBySlot[s.id] ?? null
        )
      );
  }, [slots, errorsBySlot, tripsBySlot, instructorNameById]);

  const lessons: DrivingLesson[] = useMemo(() => {
    const merged = [...previewLessons, ...completedLessons];
    const seen = new Set<string>();
    const out: DrivingLesson[] = [];
    for (const l of merged) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      out.push(l);
    }
    return out.sort((a, b) => a.date - b.date);
  }, [previewLessons, completedLessons]);

  return { lessons, errorsBySlot, loading, err };
}
