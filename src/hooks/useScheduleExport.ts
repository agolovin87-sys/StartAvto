import { useEffect, useMemo, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import { formatDriveSlotFactualExport } from "@/admin/scheduleFormat";
import { subscribeInstructors } from "@/firebase/admin";
import { fetchDriveSlotsForInstructor } from "@/firebase/drives";
import type { ScheduleExportInstructor, ScheduleLesson, ScheduleWeekRange } from "@/types/schedule";

function toInstructor(x: {
  uid: string;
  displayName: string;
  vehicleLabel: string;
  accountStatus: string;
}): ScheduleExportInstructor | null {
  if (x.accountStatus === "rejected") return null;
  return {
    id: x.uid,
    name: formatShortFio(x.displayName),
    carLabel: x.vehicleLabel?.trim() || "—",
  };
}

type State = {
  instructors: ScheduleExportInstructor[];
  loading: boolean;
  error: string | null;
};

export function useScheduleExport() {
  const [state, setState] = useState<State>({
    instructors: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    return subscribeInstructors(
      (list) => {
        const instructors = list
          .map((u) =>
            toInstructor({
              uid: u.uid,
              displayName: u.displayName,
              vehicleLabel: u.vehicleLabel,
              accountStatus: u.accountStatus,
            })
          )
          .filter((x): x is ScheduleExportInstructor => x != null)
          .sort((a, b) => a.name.localeCompare(b.name, "ru"));
        setState((prev) => ({ ...prev, instructors }));
      },
      (e) => setState((prev) => ({ ...prev, error: e.message }))
    );
  }, []);

  const instructorById = useMemo(() => {
    const m = new Map<string, ScheduleExportInstructor>();
    for (const i of state.instructors) m.set(i.id, i);
    return m;
  }, [state.instructors]);

  async function fetchLessonsForWeeks(
    instructorId: string,
    weeks: ScheduleWeekRange[]
  ): Promise<ScheduleLesson[]> {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const slots = await fetchDriveSlotsForInstructor(instructorId);
      const weekSet = new Set<string>();
      for (const w of weeks) for (const dk of w.dateKeys) weekSet.add(dk);
      return slots
        .filter((s) => weekSet.has(s.dateKey))
        .map((s) => ({
          id: s.id,
          date: s.dateKey,
          time: s.startTime || "—",
          studentName: formatShortFio((s.studentDisplayName || "").trim()),
          instructorId: s.instructorId,
          status: s.status,
          factualTimeLabel: formatDriveSlotFactualExport(s),
        }))
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.time.localeCompare(b.time, undefined, { numeric: true })
        );
    } catch (e) {
      const err = e instanceof Error ? e.message : "Не удалось загрузить расписание";
      setState((prev) => ({ ...prev, error: err }));
      throw e;
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }

  return {
    instructors: state.instructors,
    instructorById,
    loading: state.loading,
    error: state.error,
    fetchLessonsForWeeks,
  };
}
