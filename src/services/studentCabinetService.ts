/**
 * Сборка данных личного кабинета курсанта из журнала талонов, слотов вождения и ошибок урока.
 */
import { doc, getDoc } from "firebase/firestore";
import type { TalonHistoryEntry } from "@/firebase/history";
import { tripFromFirestore } from "@/firebase/driveTripHistory";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";
import { loadDriveSlotLessonErrors } from "@/services/errorTemplateService";
import type { LessonDriveError } from "@/types/errorTemplate";
import type { DriveSlot } from "@/types";
import type {
  DrivingError,
  DrivingLesson,
  StudentBalance,
  StudentProgress,
  StudentRating,
  TicketTransaction,
} from "@/types/studentCabinet";
import type { Trip } from "@/types/tripHistory";
import { clampPercent, percentOf } from "@/utils/progressCalculator";

const TRIP_COLLECTION = "driveTripTracks";

/** Название программы по умолчанию (до выноса в настройки автошколы). */
export const DEFAULT_PROGRAM_NAME = "Подготовка водителей категории B";

/** Норматив часов по программе (в т.ч. для расчёта прогресса вождения). */
export const DEFAULT_PROGRAM_TOTAL_HOURS = 56;

function talonEntryToTransaction(e: TalonHistoryEntry): TicketTransaction {
  const delta = e.delta;
  let type: TicketTransaction["type"] = delta >= 0 ? "purchase" : "use";
  if (delta < 0 && (e.fromDisplayName?.toLowerCase().includes("возврат") || e.fromDisplayName?.includes("возврат"))) {
    type = "refund";
  }
  const parts: string[] = [];
  if (e.fromDisplayName) parts.push(`Контрагент: ${e.fromDisplayName}`);
  if (e.fromRole) parts.push(`Роль: ${e.fromRole}`);
  return {
    id: e.id,
    date: e.at,
    type,
    amount: delta,
    description: parts.length ? parts.join(". ") : "Изменение баланса талонов",
  };
}

/** Баланс и история по журналу `adminTalonHistory` и текущему полю `talons` в профиле. */
export function buildStudentBalance(
  currentTalons: number,
  entries: TalonHistoryEntry[],
  /** Если журнал пуст, оценка списаний по счётчику завершённых вождений из профиля */
  drivesCompletedFallback = 0
): StudentBalance {
  const ticketsHistory = entries.map(talonEntryToTransaction);
  let usedFromHistory = 0;
  let credited = 0;
  for (const e of entries) {
    if (e.delta < 0) usedFromHistory += Math.abs(e.delta);
    if (e.delta > 0) credited += e.delta;
  }
  const remainingTickets = Math.max(0, Math.floor(currentTalons));
  const usedTickets = Math.max(usedFromHistory, drivesCompletedFallback);
  const totalTickets = Math.max(remainingTickets + usedTickets, credited, remainingTickets);
  return {
    totalTickets,
    usedTickets,
    remainingTickets,
    ticketsHistory,
  };
}

function inferErrorCategory(name: string): DrivingError["category"] {
  const n = name.toLowerCase();
  if (/загло|двигател|сцеплен|тормоз|передач|рул|стар|тормож/i.test(n)) return "technique";
  if (/зеркал|вниман|смотрел|осмотр/i.test(n)) return "attention";
  return "traffic";
}

function lessonErrorsToDrivingErrors(rows: LessonDriveError[]): DrivingError[] {
  const map = new Map<string, { name: string; points: number; category: DrivingError["category"]; count: number }>();
  for (const r of rows) {
    const key = `${r.name}|${r.points}`;
    const cat = inferErrorCategory(r.name);
    const prev = map.get(key);
    if (prev) prev.count += 1;
    else map.set(key, { name: r.name, points: r.points, category: cat, count: 1 });
  }
  return [...map.values()].map((v, i) => ({
    id: `agg-${i}-${v.points}`,
    name: v.name,
    category: v.category,
    points: v.points,
    count: v.count,
  }));
}

function ratingFromErrors(errorRows: LessonDriveError[]): number {
  if (errorRows.length === 0) return 5;
  const pts = errorRows.reduce((s, e) => s + Math.max(0, e.points), 0);
  const r = 5 - pts / 15;
  return Math.round(Math.max(1, Math.min(5, r)) * 10) / 10;
}

function slotAnchorMs(slot: DriveSlot): number {
  if (slot.liveEndedAt != null) return slot.liveEndedAt;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(slot.dateKey.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(slot.startTime.trim() || "12:00");
  if (!m) return slot.createdAt;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const hh = tm ? Number(tm[1]) : 12;
  const min = tm ? Number(tm[2]) : 0;
  return new Date(y, mo - 1, day, hh, min).getTime();
}

function durationMinutesFromSlot(slot: DriveSlot, trip: Trip | null): number {
  if (trip && trip.duration > 0) return Math.round(trip.duration / 60);
  if (slot.liveEndedAt != null && slot.liveStudentAckAt != null) {
    const raw = slot.liveEndedAt - slot.liveStudentAckAt - (slot.liveTotalPausedMs ?? 0);
    return Math.max(1, Math.round(raw / 60_000));
  }
  return 90;
}

function distanceKmFromTrip(trip: Trip | null): number {
  if (!trip || trip.distance <= 0) return 0;
  return Math.round((trip.distance / 1000) * 10) / 10;
}

export function buildDrivingLesson(
  slot: DriveSlot,
  instructorName: string,
  errors: LessonDriveError[],
  trip: Trip | null
): DrivingLesson {
  const drivingErrs = lessonErrorsToDrivingErrors(errors);
  return {
    id: slot.id,
    date: slotAnchorMs(slot),
    instructorName: instructorName || "Инструктор",
    carModel: trip?.carId ? `ТС ${trip.carId}` : "—",
    duration: durationMinutesFromSlot(slot, trip),
    distance: distanceKmFromTrip(trip),
    rating: ratingFromErrors(errors),
    errors: drivingErrs,
    type: "regular",
    /** Заметки к треку / комментарий инструктора; для отменённых слотов — причина в cancelReason. */
    instructorComment:
      trip?.notes?.trim() ||
      (slot.status === "cancelled" ? slot.cancelReason?.trim() : undefined) ||
      undefined,
  };
}

/** Параллельная загрузка ошибок урока по слотам (Firestore `driveSlotLessonErrors`). */
export async function loadLessonErrorsForSlots(
  slotIds: string[]
): Promise<Record<string, LessonDriveError[]>> {
  const out: Record<string, LessonDriveError[]> = {};
  const chunk = 12;
  for (let i = 0; i < slotIds.length; i += chunk) {
    const part = slotIds.slice(i, i + chunk);
    await Promise.all(
      part.map(async (id) => {
        try {
          out[id] = await loadDriveSlotLessonErrors(id);
        } catch {
          out[id] = [];
        }
      })
    );
  }
  return out;
}

/** Однократная загрузка трека по слоту. */
export async function fetchTripForSlot(slotId: string): Promise<Trip | null> {
  if (!isFirebaseConfigured || !slotId.trim()) return null;
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, TRIP_COLLECTION, slotId.trim()));
  if (!snap.exists()) return null;
  return tripFromFirestore(snap.data() as Record<string, unknown>, snap.id);
}

export function aggregateCommonErrors(lessons: DrivingLesson[], topN = 5): DrivingError[] {
  const map = new Map<string, DrivingError>();
  for (const les of lessons) {
    for (const e of les.errors) {
      const key = `${e.name}|${e.points}`;
      const prev = map.get(key);
      if (prev) prev.count += e.count;
      else map.set(key, { ...e });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, topN);
}

export function buildStudentRating(lessons: DrivingLesson[]): StudentRating {
  if (lessons.length === 0) {
    return {
      averageRating: 0,
      totalLessons: 0,
      bestLesson: null,
      worstLesson: null,
      commonErrors: [],
      improvement: 0,
      groupPercentileRank: null,
    };
  }
  const sorted = [...lessons].sort((a, b) => b.rating - a.rating);
  const bestLesson = sorted[0] ?? null;
  const worstLesson = [...lessons].sort((a, b) => a.rating - b.rating)[0] ?? null;
  const avg = lessons.reduce((s, l) => s + l.rating, 0) / lessons.length;
  const last5 = lessons
    .filter((l) => l.type === "regular")
    .sort((a, b) => b.date - a.date)
    .slice(0, 5);
  const prev5 = lessons
    .filter((l) => l.type === "regular")
    .sort((a, b) => b.date - a.date)
    .slice(5, 10);
  let improvement = 0;
  if (last5.length && prev5.length) {
    const a1 = last5.reduce((s, l) => s + l.rating, 0) / last5.length;
    const a0 = prev5.reduce((s, l) => s + l.rating, 0) / prev5.length;
    if (a0 > 0) improvement = Math.round(((a1 - a0) / a0) * 100);
  }
  return {
    averageRating: Math.round(avg * 10) / 10,
    totalLessons: lessons.length,
    bestLesson,
    worstLesson,
    commonErrors: aggregateCommonErrors(lessons, 5),
    improvement,
    groupPercentileRank: null,
  };
}

export function buildStudentProgress(
  _completedDriveCount: number,
  completedHoursApprox: number,
  exams: StudentProgress["exams"]
): StudentProgress {
  const totalHours = DEFAULT_PROGRAM_TOTAL_HOURS;
  const completedHours = Math.min(completedHoursApprox, totalHours);
  const drivingProgress = percentOf(completedHours, totalHours);
  const theoryProgress = clampPercent(drivingProgress * 0.75);
  const percentage = clampPercent((theoryProgress + drivingProgress) / 2);
  return {
    programName: DEFAULT_PROGRAM_NAME,
    totalHours,
    completedHours,
    percentage,
    theoryProgress,
    drivingProgress,
    exams,
  };
}

/** Собрать уроки из завершённых слотов и карт ошибок/треков. */
export function assembleDrivingLessons(
  slots: DriveSlot[],
  errorsBySlot: Record<string, LessonDriveError[]>,
  tripsBySlot: Record<string, Trip | null>,
  instructorNameById: Record<string, string>
): DrivingLesson[] {
  const completed = slots
    .filter((s) => s.status === "completed")
    .sort((a, b) => slotAnchorMs(b) - slotAnchorMs(a));
  return completed.map((slot) =>
    buildDrivingLesson(
      slot,
      instructorNameById[slot.instructorId] ?? "",
      errorsBySlot[slot.id] ?? [],
      tripsBySlot[slot.id] ?? null
    )
  );
}

export async function getLessonDetails(
  slot: DriveSlot,
  instructorName: string
): Promise<DrivingLesson> {
  const [errors, trip] = await Promise.all([
    loadDriveSlotLessonErrors(slot.id),
    fetchTripForSlot(slot.id),
  ]);
  return buildDrivingLesson(slot, instructorName, errors, trip);
}
