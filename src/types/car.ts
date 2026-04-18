/** Учебный автомобиль автошколы. */
export type CarStatus = "active" | "maintenance" | "repair" | "inactive";

export interface Car {
  id: string;
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  vin: string;
  color: string;
  instructorId: string | null;
  /** Денормализация для списков */
  instructorName?: string;
  status: CarStatus;
  mileage: number;
  fuelLevel?: number;
  lastMaintenanceDate: number | null;
  nextMaintenanceDate: number | null;
  /** Пробег (км), при котором запланировано следующее ТО */
  nextServiceDueMileage: number | null;
  maintenanceInterval: number;
  notes?: string;
  /** Фото (data URL), опционально */
  photoDataUrl?: string | null;
  /** Мягкое удаление */
  deleted?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type CarMaintenanceType = "TO" | "repair" | "tyre_change" | "other";

export interface CarMaintenance {
  id: string;
  carId: string;
  date: number;
  type: CarMaintenanceType;
  mileage: number;
  cost: number;
  description: string;
  /** Пробег до следующего ТО (после этой записи) */
  nextMileage: number;
}
