import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import {
  dateKeyToRuDisplay,
  formatDriveSlotStatus,
  localDateKey,
  sortSlotsByTime,
} from "@/admin/scheduleFormat";
import { subscribeDriveSlotsForInstructor } from "@/firebase/drives";
import { subscribeInstructors, subscribeStudents } from "@/firebase/admin";
import { useDriveLocationSharingUi } from "@/context/DriveLocationSharingUiContext";
import {
  formatDriveShareAdminScheduleCell,
  subscribeStudentDriveLocationShare,
  type StudentDriveLocationShare,
} from "@/firebase/studentDriveLocationShare";
import { AdminScheduleTripHistoryCell } from "@/components/AdminScheduleTripHistoryCell";
import { ExportSchedule } from "@/components/admin/ExportSchedule";
import type { DriveSlot, UserProfile } from "@/types";

function groupByDateKey(slots: DriveSlot[]): Map<string, DriveSlot[]> {
  const map = new Map<string, DriveSlot[]>();
  for (const s of slots) {
    if (!s.dateKey) continue;
    const list = map.get(s.dateKey) ?? [];
    list.push(s);
    map.set(s.dateKey, list);
  }
  for (const [, list] of map) {
    list.sort(sortSlotsByTime);
  }
  return map;
}

/** Все даты кроме сегодня: сначала будущие по возрастанию, затем прошлые по убыванию. */
function historyDateKeysOrdered(
  instructorSlots: DriveSlot[],
  todayKey: string
): string[] {
  const byDay = groupByDateKey(instructorSlots);
  const keys = [...byDay.keys()].filter((k) => k !== todayKey);
  const future = keys.filter((k) => k > todayKey).sort((a, b) => a.localeCompare(b));
  const past = keys.filter((k) => k < todayKey).sort((a, b) => b.localeCompare(a));
  return [...future, ...past];
}

function ScheduleSlotAddressCell({ slotId }: { slotId: string }) {
  const [share, setShare] = useState<StudentDriveLocationShare | null>(null);

  useEffect(() => {
    return subscribeStudentDriveLocationShare(slotId, setShare);
  }, [slotId]);

  return (
    <td className="admin-schedule-table-address-cell">
      {formatDriveShareAdminScheduleCell(share)}
    </td>
  );
}

function ScheduleDayBlock({
  dateKey,
  slots,
  studentMap,
  gpsTrackerEnabled,
  idSuffix,
  TitleTag = "h2",
}: {
  dateKey: string;
  slots: DriveSlot[];
  studentMap: Map<string, UserProfile>;
  gpsTrackerEnabled: boolean;
  /** Уникальный суффикс для id (например uid инструктора). */
  idSuffix: string;
  TitleTag?: ElementType;
}) {
  const safeSuffix = idSuffix.replace(/[^a-zA-Z0-9_-]/g, "_");
  const titleId = `schedule-day-${safeSuffix}-${dateKey}`;
  const Title = TitleTag;
  return (
    <section className="admin-schedule-day-block" aria-labelledby={titleId}>
      <Title className="admin-schedule-day-title" id={titleId}>
        {dateKeyToRuDisplay(dateKey)}
      </Title>
      <div className="admin-schedule-table-wrap">
        <table className="admin-schedule-table">
          <thead>
            <tr>
              <th scope="col">№</th>
              <th scope="col">Время</th>
              <th scope="col">Фамилия И.О. курсанта</th>
              <th scope="col">Статус</th>
              <th scope="col">Адрес</th>
              <th scope="col">История поездки</th>
            </tr>
          </thead>
          <tbody>
            {slots.length === 0 ? (
              <tr>
                <td colSpan={6} className="admin-schedule-table-empty">
                  Нет записей на эту дату.
                </td>
              </tr>
            ) : (
              slots.map((slot, idx) => (
                <tr key={slot.id}>
                  <td>{idx + 1}</td>
                  <td>{slot.startTime || "—"}</td>
                  <td>
                    {formatShortFio(
                      studentMap.get(slot.studentId)?.displayName ?? ""
                    )}
                  </td>
                  <td>{formatDriveSlotStatus(slot)}</td>
                  <ScheduleSlotAddressCell slotId={slot.id} />
                  <AdminScheduleTripHistoryCell
                    slotId={slot.id}
                    slotStatus={slot.status}
                    gpsTrackerEnabled={gpsTrackerEnabled}
                  />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"
      />
    </svg>
  );
}

export function AdminScheduleTab() {
  const { gpsTrackerEnabled } = useDriveLocationSharingUi();
  const [instructors, setInstructors] = useState<UserProfile[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [allSlots, setAllSlots] = useState<DriveSlot[]>([]);
  const [historyOpenByInstructor, setHistoryOpenByInstructor] = useState<
    Record<string, boolean>
  >({});
  const [err, setErr] = useState<string | null>(null);

  const instructorList = useMemo(
    () =>
      [...instructors]
        .filter((i) => i.accountStatus !== "rejected")
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "ru")),
    [instructors]
  );

  useEffect(() => {
    const u1 = subscribeInstructors(setInstructors, (e) => setErr(e.message));
    const u2 = subscribeStudents(setStudents, () => {});
    return () => {
      u1();
      u2();
    };
  }, []);

  useEffect(() => {
    if (instructorList.length === 0) {
      setAllSlots([]);
      return;
    }
    const slotMap = new Map<string, DriveSlot[]>();
    const mergeAndSet = () => {
      const merged: DriveSlot[] = [];
      for (const ins of instructorList) {
        merged.push(...(slotMap.get(ins.uid) ?? []));
      }
      setAllSlots(merged);
    };
    const unsubs = instructorList.map((ins) =>
      subscribeDriveSlotsForInstructor(
        ins.uid,
        (slots) => {
          slotMap.set(ins.uid, slots);
          mergeAndSet();
        },
        (e) => setErr(e.message)
      )
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [instructorList]);

  const studentMap = useMemo(() => {
    const m = new Map<string, UserProfile>();
    for (const s of students) m.set(s.uid, s);
    return m;
  }, [students]);

  const slotsByInstructor = useMemo(() => {
    const m = new Map<string, DriveSlot[]>();
    for (const s of allSlots) {
      if (!s.instructorId) continue;
      const list = m.get(s.instructorId) ?? [];
      list.push(s);
      m.set(s.instructorId, list);
    }
    return m;
  }, [allSlots]);

  const todayKey = localDateKey();

  return (
    <div className="admin-tab admin-schedule-tab">
      <h1 className="admin-tab-title">График</h1>
      <ExportSchedule />
      {err ? (
        <div className="form-error" role="alert">
          {err}
          {/permission|доступ/i.test(err) ? (
            <span className="admin-schedule-permission-hint">
              {" "}
              Опубликуйте актуальные правила из файла{" "}
              <code className="admin-inline-code">firestore.rules</code> в консоли Firebase или
              выполните:{" "}
              <code className="admin-inline-code">firebase deploy --only firestore:rules</code>
            </span>
          ) : null}
        </div>
      ) : null}

      {instructorList.length === 0 ? (
        <p className="admin-empty">Нет инструкторов.</p>
      ) : (
        <ul className="admin-schedule-instructor-list">
          {instructorList.map((ins) => {
            const instructorSlots = slotsByInstructor.get(ins.uid) ?? [];
            const byDay = groupByDateKey(instructorSlots);
            const historyKeys = historyDateKeysOrdered(instructorSlots, todayKey);
            const historyOpen = historyOpenByInstructor[ins.uid] ?? false;
            const panelId = `history-panel-${ins.uid}`;
            const btnId = `history-btn-${ins.uid}`;
            return (
              <li key={ins.uid} className="admin-schedule-instructor-block">
                <h2 className="admin-schedule-instructor-name">
                  {formatShortFio(ins.displayName)}
                </h2>
                <div className="admin-schedule-today-wrap">
                  <ScheduleDayBlock
                    dateKey={todayKey}
                    slots={byDay.get(todayKey) ?? []}
                    studentMap={studentMap}
                    gpsTrackerEnabled={gpsTrackerEnabled}
                    idSuffix={ins.uid}
                    TitleTag="h3"
                  />
                </div>
                <button
                  type="button"
                  id={btnId}
                  className={
                    historyOpen
                      ? "admin-schedule-history-toggle is-open"
                      : "admin-schedule-history-toggle"
                  }
                  aria-expanded={historyOpen}
                  aria-controls={panelId}
                  onClick={() =>
                    setHistoryOpenByInstructor((prev) => ({
                      ...prev,
                      [ins.uid]: !prev[ins.uid],
                    }))
                  }
                >
                  <span className="admin-schedule-history-toggle-label">
                    История вождений
                  </span>
                  <IconChevronDown className="admin-schedule-history-chevron" />
                </button>
                {historyOpen ? (
                  <div
                    id={panelId}
                    className="admin-schedule-history-panel"
                    role="region"
                    aria-labelledby={btnId}
                  >
                    {historyKeys.length === 0 ? (
                      <p className="admin-empty admin-schedule-history-empty">
                        Нет записей в истории.
                      </p>
                    ) : (
                      <div className="admin-schedule-instructor-history-days">
                        {historyKeys.map((dk) => (
                          <ScheduleDayBlock
                            key={dk}
                            dateKey={dk}
                            slots={byDay.get(dk) ?? []}
                            studentMap={studentMap}
                            gpsTrackerEnabled={gpsTrackerEnabled}
                            idSuffix={ins.uid}
                            TitleTag="h4"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
