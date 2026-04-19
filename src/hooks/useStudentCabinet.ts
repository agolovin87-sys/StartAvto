import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribeDriveSlotsForStudent } from "@/firebase/drives";
import { subscribeTalonHistoryForUser, type TalonHistoryEntry } from "@/firebase/history";
import { getUserProfile } from "@/firebase/users";
import type { DriveSlot } from "@/types";
import type { StudentExamView } from "@/types/internalExam";
import type {
  StudentBalance,
  StudentProgress,
  StudentRating,
  DrivingLesson,
} from "@/types/studentCabinet";
import {
  assembleDrivingLessons,
  buildStudentBalance,
  buildStudentProgress,
  buildStudentRating,
  loadLessonErrorsForSlots,
  fetchTripForSlot,
} from "@/services/studentCabinetService";
import { APPROX_HOURS_PER_COMPLETED_DRIVE } from "@/utils/progressCalculator";
import type { Trip } from "@/types/tripHistory";

function examViewsToProgressExams(views: StudentExamView[]): StudentProgress["exams"] {
  if (views.length === 0) {
    return [
      { type: "internal", name: "Внутренний экзамен (площадка / маршрут)", status: "pending" },
      { type: "theory", name: "Теория ГИБДД", status: "pending" },
      { type: "gibdd", name: "Практика ГИБДД", status: "pending" },
    ];
  }
  const sorted = [...views].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const inProgress = sorted.some((v) => v.status === "in_progress");
  const finished = sorted.filter((v) => v.status === "passed" || v.status === "failed");
  const latest = finished[0];
  let internalStatus: "pending" | "passed" | "failed" = "pending";
  if (inProgress) internalStatus = "pending";
  else if (latest?.status === "passed") internalStatus = "passed";
  else if (latest?.status === "failed") internalStatus = "failed";
  return [
    {
      type: "internal",
      name: "Внутренний экзамен",
      status: internalStatus,
      date: latest?.completedAt,
      score: typeof latest?.totalPoints === "number" ? latest.totalPoints : undefined,
      maxScore: 7,
    },
    { type: "theory", name: "Теория ГИБДД", status: "pending" },
    { type: "gibdd", name: "Практика ГИБДД", status: "pending" },
  ];
}

/**
 * Подписка на слоты и журнал талонов + сбор уроков с ошибками и треками (обновление после каждого урока).
 */
export function useStudentCabinet(
  studentId: string | undefined,
  currentTalons: number,
  drivesCount: number,
  exams: StudentExamView[]
) {
  const [slots, setSlots] = useState<DriveSlot[]>([]);
  const [talonEntries, setTalonEntries] = useState<TalonHistoryEntry[]>([]);
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
      setTalonEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubSlots = subscribeDriveSlotsForStudent(
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
    const unsubTalons = subscribeTalonHistoryForUser(
      uid,
      (list) => setTalonEntries(list),
      () => {}
    );
    return () => {
      unsubSlots();
      unsubTalons();
    };
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

  const completedCount = useMemo(
    () => slots.filter((s) => s.status === "completed").length,
    [slots]
  );

  const completedHoursApprox = useMemo(
    () => completedCount * APPROX_HOURS_PER_COMPLETED_DRIVE,
    [completedCount]
  );

  const lessons: DrivingLesson[] = useMemo(
    () => assembleDrivingLessons(slots, errorsBySlot, tripsBySlot, instructorNameById),
    [slots, errorsBySlot, tripsBySlot, instructorNameById]
  );

  const balance: StudentBalance = useMemo(
    () => buildStudentBalance(currentTalons, talonEntries, drivesCount),
    [currentTalons, talonEntries, drivesCount]
  );

  const progress: StudentProgress = useMemo(
    () => buildStudentProgress(completedCount, completedHoursApprox, examViewsToProgressExams(exams)),
    [completedCount, completedHoursApprox, exams]
  );

  const rating: StudentRating = useMemo(() => buildStudentRating(lessons), [lessons]);

  const refetchSnapshots = useCallback(() => {
    /* onSnapshot сам шлёт обновления; заглушка для явного вызова из UI при необходимости */
  }, []);

  return {
    balance,
    progress,
    lessons,
    errors: rating.commonErrors,
    rating,
    loading,
    err,
    slots,
    refetchSnapshots,
  };
}
