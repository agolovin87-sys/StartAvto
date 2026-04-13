/** GPS-трек урока вождения (локально + синхронизация с Firestore). */

export interface TripPoint {
  lat: number;
  lng: number;
  timestamp: number;
  speed?: number;
  accuracy?: number;
  heading?: number;
  altitude?: number;
}

export interface TripError {
  id: string;
  type: "speeding" | "hard_brake" | "hard_acceleration" | "sharp_turn" | "lane_change";
  point: TripPoint;
  severity: "low" | "medium" | "high";
  description: string;
}

export type TripStatus = "recording" | "completed" | "paused" | "synced";

export type TripSyncStatus = "pending" | "syncing" | "synced" | "error";

export interface Trip {
  id: string;
  /** ID курсанта */
  userId: string;
  instructorId: string;
  /** ID автомобиля (пока необязательно — пустая строка, если нет справочника ТС). */
  carId: string;
  /** Совпадает с `driveSlots/{id}` — один документ трека на слот. */
  driveSlotId: string;
  startTime: number;
  endTime: number | null;
  /** Длительность, сек */
  duration: number;
  /** Путь, м */
  distance: number;
  /** Средняя скорость, км/ч */
  avgSpeed: number;
  /** Макс. скорость, км/ч */
  maxSpeed: number;
  points: TripPoint[];
  status: TripStatus;
  syncStatus: TripSyncStatus;
  notes?: string;
  rating?: number;
  errors?: TripError[];
}

export interface TripStatistics {
  totalTrips: number;
  totalDistance: number;
  totalDuration: number;
  avgSpeed: number;
  maxSpeed: number;
  errorCount: number;
  ratingAvg: number;
}
