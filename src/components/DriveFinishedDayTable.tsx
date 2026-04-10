import type { DriveSlot } from "@/types";

function driveFinishedTimeLabel(slot: DriveSlot): string {
  return (slot.startTime || "—").trim();
}

function driveFinishedStatusLabel(slot: DriveSlot): string {
  if (slot.status === "completed") return "Завершено";
  if (slot.status === "cancelled") {
    const by =
      slot.cancelledByRole === "student"
        ? "курсантом"
        : slot.cancelledByRole === "instructor"
          ? "инструктором"
          : slot.cancelledByRole === "admin"
            ? "администратором"
            : null;
    return by ? `Отменено (${by})` : "Отменено";
  }
  return "—";
}

export function groupFinishedDriveSlotsByDateKey(slots: DriveSlot[]): Map<string, DriveSlot[]> {
  const m = new Map<string, DriveSlot[]>();
  for (const s of slots) {
    if (s.status !== "completed" && s.status !== "cancelled") continue;
    const dk = s.dateKey?.trim();
    if (!dk) continue;
    const list = m.get(dk) ?? [];
    list.push(s);
    m.set(dk, list);
  }
  for (const [, list] of m) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime, undefined, { numeric: true }));
  }
  return m;
}

type DriveFinishedDayTableProps =
  | { slots: DriveSlot[]; variant: "student" }
  | {
      slots: DriveSlot[];
      variant: "instructor";
      cadetShortName: (slot: DriveSlot) => string;
    };

export function DriveFinishedDayTable(props: DriveFinishedDayTableProps) {
  const { slots, variant } = props;
  if (slots.length === 0) return null;
  const showCadet = variant === "instructor";
  const cadetShortName = variant === "instructor" ? props.cadetShortName : undefined;

  return (
    <div className="drive-finished-day-table-block">
      <div className="drive-finished-day-table-scroll">
        <table className="drive-finished-day-table">
          <thead>
            <tr>
              <th scope="col">№ п/п</th>
              <th scope="col">Время</th>
              {showCadet ? <th scope="col">ФИО курсанта</th> : null}
              <th scope="col">Статус</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((sl, idx) => (
              <tr key={sl.id}>
                <td>{idx + 1}</td>
                <td>{driveFinishedTimeLabel(sl)}</td>
                {showCadet && cadetShortName ? <td>{cadetShortName(sl)}</td> : null}
                <td>{driveFinishedStatusLabel(sl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
