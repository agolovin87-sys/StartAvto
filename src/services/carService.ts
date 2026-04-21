/**
 * Учебные автомобили: Firestore `cars` и подколлекция `maintenance`.
 */
import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { Car, CarMaintenance, CarMaintenanceType, CarStatus } from "@/types/car";
import { getFirebase } from "@/firebase/config";

const CARS = "cars";
const MAINT = "maintenance";

function toMillis(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (
    v &&
    typeof v === "object" &&
    "toMillis" in v &&
    typeof (v as { toMillis: () => number }).toMillis === "function"
  ) {
    return (v as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

export function normalizeCar(id: string, data: Record<string, unknown>): Car {
  const statusRaw = data.status;
  const status: CarStatus =
    statusRaw === "maintenance" ||
    statusRaw === "repair" ||
    statusRaw === "inactive" ||
    statusRaw === "active"
      ? statusRaw
      : "active";

  return {
    id,
    brand: typeof data.brand === "string" ? data.brand : "",
    model: typeof data.model === "string" ? data.model : "",
    year: typeof data.year === "number" ? data.year : new Date().getFullYear(),
    licensePlate: typeof data.licensePlate === "string" ? data.licensePlate : "",
    vin: typeof data.vin === "string" ? data.vin : "",
    color: typeof data.color === "string" ? data.color : "#808080",
    instructorId:
      typeof data.instructorId === "string"
        ? data.instructorId
        : data.instructorId === null
          ? null
          : null,
    instructorName:
      typeof data.instructorName === "string" ? data.instructorName : undefined,
    status,
    mileage: typeof data.mileage === "number" ? data.mileage : 0,
    fuelLevel: typeof data.fuelLevel === "number" ? data.fuelLevel : undefined,
    lastMaintenanceDate:
      data.lastMaintenanceDate == null
        ? null
        : toMillis(data.lastMaintenanceDate),
    nextMaintenanceDate:
      data.nextMaintenanceDate == null
        ? null
        : toMillis(data.nextMaintenanceDate),
    nextServiceDueMileage:
      typeof data.nextServiceDueMileage === "number"
        ? data.nextServiceDueMileage
        : null,
    nextServiceType:
      data.nextServiceType === "TO" ||
      data.nextServiceType === "oil_change" ||
      data.nextServiceType === "repair" ||
      data.nextServiceType === "tyre_change" ||
      data.nextServiceType === "other"
        ? data.nextServiceType
        : null,
    maintenanceInterval:
      typeof data.maintenanceInterval === "number" ? data.maintenanceInterval : 10000,
    notes: typeof data.notes === "string" ? data.notes : undefined,
    photoDataUrl:
      typeof data.photoDataUrl === "string"
        ? data.photoDataUrl
        : data.photoDataUrl === null
          ? null
          : undefined,
    osagoFileDataUrl:
      typeof data.osagoFileDataUrl === "string"
        ? data.osagoFileDataUrl
        : data.osagoFileDataUrl === null
          ? null
          : undefined,
    osagoFileName:
      typeof data.osagoFileName === "string"
        ? data.osagoFileName
        : data.osagoFileName === null
          ? null
          : undefined,
    osagoStoragePath:
      typeof data.osagoStoragePath === "string"
        ? data.osagoStoragePath
        : data.osagoStoragePath === null
          ? null
          : undefined,
    osagoFromDate:
      data.osagoFromDate == null ? null : toMillis(data.osagoFromDate),
    osagoToDate:
      data.osagoToDate == null ? null : toMillis(data.osagoToDate),
    diagCardFileDataUrl:
      typeof data.diagCardFileDataUrl === "string"
        ? data.diagCardFileDataUrl
        : data.diagCardFileDataUrl === null
          ? null
          : undefined,
    diagCardFileName:
      typeof data.diagCardFileName === "string"
        ? data.diagCardFileName
        : data.diagCardFileName === null
          ? null
          : undefined,
    diagCardStoragePath:
      typeof data.diagCardStoragePath === "string"
        ? data.diagCardStoragePath
        : data.diagCardStoragePath === null
          ? null
          : undefined,
    diagCardDueDate:
      data.diagCardDueDate == null ? null : toMillis(data.diagCardDueDate),
    deleted: data.deleted === true,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

function normalizeMaintenance(
  id: string,
  carId: string,
  data: Record<string, unknown>
): CarMaintenance {
  const typeRaw = data.type;
  const type: CarMaintenanceType =
    typeRaw === "oil_change" ||
    typeRaw === "repair" ||
    typeRaw === "tyre_change" ||
    typeRaw === "other" ||
    typeRaw === "TO"
      ? typeRaw
      : "TO";
  return {
    id,
    carId,
    date: toMillis(data.date),
    type,
    mileage: typeof data.mileage === "number" ? data.mileage : 0,
    cost: typeof data.cost === "number" ? data.cost : 0,
    description: typeof data.description === "string" ? data.description : "",
    nextMileage: typeof data.nextMileage === "number" ? data.nextMileage : 0,
  };
}

export type CarInput = Omit<
  Car,
  "id" | "createdAt" | "updatedAt" | "deleted" | "instructorName"
> & {
  instructorName?: string;
};

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export async function getCars(): Promise<Car[]> {
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, CARS));
  const list: Car[] = [];
  for (const d of snap.docs) {
    const c = normalizeCar(d.id, d.data() as Record<string, unknown>);
    if (!c.deleted) list.push(c);
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  return list;
}

export function subscribeCars(
  onUpdate: (cars: Car[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  return onSnapshot(
    collection(db, CARS),
    (snap) => {
      const list: Car[] = [];
      for (const d of snap.docs) {
        const c = normalizeCar(d.id, d.data() as Record<string, unknown>);
        if (!c.deleted) list.push(c);
      }
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      onUpdate(list);
    },
    (e) => onError?.(e as Error)
  );
}

export async function getCar(id: string): Promise<Car | null> {
  const { db } = getFirebase();
  const ref = doc(db, CARS, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return normalizeCar(snap.id, snap.data() as Record<string, unknown>);
}

export async function createCar(data: CarInput): Promise<string> {
  const { db } = getFirebase();
  const now = Date.now();
  const payload = stripUndefined({
    ...data,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  } as Record<string, unknown>);
  const ref = await addDoc(collection(db, CARS), payload as DocumentData);
  return ref.id;
}

export async function updateCar(id: string, data: Partial<CarInput>): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, CARS, id);
  const patch = stripUndefined({
    ...data,
    updatedAt: Date.now(),
  } as Record<string, unknown>);
  await updateDoc(ref, patch as DocumentData);
}

/** Мягкое удаление */
export async function deleteCar(id: string): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, CARS, id), {
    deleted: true,
    status: "inactive",
    updatedAt: Date.now(),
  });
}

export async function assignInstructor(
  carId: string,
  instructorId: string | null,
  instructorName?: string | null
): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, CARS, carId);
  if (instructorId) {
    const patch: Record<string, unknown> = {
      instructorId,
      updatedAt: Date.now(),
    };
    if (instructorName && instructorName.trim())
      patch.instructorName = instructorName.trim();
    else patch.instructorName = deleteField();
    await updateDoc(ref, patch as DocumentData);
  } else {
    await updateDoc(ref, {
      instructorId: null,
      instructorName: deleteField(),
      updatedAt: Date.now(),
    });
  }
}

export async function getMaintenanceHistory(carId: string): Promise<CarMaintenance[]> {
  const { db } = getFirebase();
  const q = query(
    collection(doc(db, CARS, carId), MAINT),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) =>
    normalizeMaintenance(d.id, carId, d.data() as Record<string, unknown>)
  );
}

export function subscribeMaintenanceHistory(
  carId: string,
  onUpdate: (rows: CarMaintenance[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  const q = query(
    collection(doc(db, CARS, carId), MAINT),
    orderBy("date", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) =>
        normalizeMaintenance(d.id, carId, d.data() as Record<string, unknown>)
      );
      onUpdate(rows);
    },
    (e) => onError?.(e as Error)
  );
}

export type MaintenanceInput = Omit<CarMaintenance, "id" | "carId">;

async function syncCarFromLatestMaintenance(carId: string): Promise<void> {
  const { db } = getFirebase();
  const carRef = doc(db, CARS, carId);
  const carSnap = await getDoc(carRef);
  if (!carSnap.exists()) throw new Error("Автомобиль не найден");
  const car = normalizeCar(carSnap.id, carSnap.data() as Record<string, unknown>);
  const latestSnap = await getDocs(
    query(collection(doc(db, CARS, carId), MAINT), orderBy("date", "desc"), limit(1))
  );
  const latest = latestSnap.docs[0]
    ? normalizeMaintenance(
        latestSnap.docs[0].id,
        carId,
        latestSnap.docs[0].data() as Record<string, unknown>
      )
    : null;
  await updateDoc(carRef, {
    mileage: latest ? Math.max(car.mileage, latest.mileage) : car.mileage,
    lastMaintenanceDate: latest ? latest.date : car.lastMaintenanceDate,
    nextServiceDueMileage: latest ? latest.nextMileage : null,
    nextServiceType: latest ? latest.type : null,
    updatedAt: Date.now(),
  });
}

export async function addMaintenanceRecord(
  carId: string,
  data: MaintenanceInput
): Promise<void> {
  const { db } = getFirebase();
  const carSnap = await getDoc(doc(db, CARS, carId));
  if (!carSnap.exists()) throw new Error("Автомобиль не найден");

  await addDoc(collection(doc(db, CARS, carId), MAINT), {
    date: data.date,
    type: data.type,
    mileage: data.mileage,
    cost: data.cost,
    description: data.description,
    nextMileage: data.nextMileage,
    createdAt: serverTimestamp(),
  });
  await syncCarFromLatestMaintenance(carId);
}

export async function updateMaintenanceRecord(
  carId: string,
  maintenanceId: string,
  data: MaintenanceInput
): Promise<void> {
  const { db } = getFirebase();
  const maintRef = doc(doc(db, CARS, carId), MAINT, maintenanceId);
  const maintSnap = await getDoc(maintRef);
  if (!maintSnap.exists()) throw new Error("Запись ТО не найдена");
  await updateDoc(maintRef, {
    date: data.date,
    type: data.type,
    mileage: data.mileage,
    cost: data.cost,
    description: data.description,
    nextMileage: data.nextMileage,
    updatedAt: serverTimestamp(),
  });
  await syncCarFromLatestMaintenance(carId);
}

export async function deleteMaintenanceRecord(
  carId: string,
  maintenanceId: string
): Promise<void> {
  const { db } = getFirebase();
  const maintRef = doc(doc(db, CARS, carId), MAINT, maintenanceId);
  const maintSnap = await getDoc(maintRef);
  if (!maintSnap.exists()) throw new Error("Запись ТО не найдена");
  await deleteDoc(maintRef);
  await syncCarFromLatestMaintenance(carId);
}

export async function uploadCarDocument(
  file: File,
  kind: "osago" | "diag",
  carId?: string
): Promise<{ url: string; path: string; fileName: string }> {
  const { storage } = getFirebase();
  const safeName = file.name.replace(/[^\w.\-()]+/g, "_");
  const path = `cars/docs/${carId ?? "new"}/${kind}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || undefined });
  const url = await getDownloadURL(storageRef);
  return { url, path, fileName: file.name };
}

export async function deleteCarDocument(storagePath: string | null | undefined): Promise<void> {
  const path = (storagePath ?? "").trim();
  if (!path) return;
  const { storage } = getFirebase();
  await deleteObject(ref(storage, path));
}

/** Активные авто (для будущей привязки к урокам). */
export async function getActiveCars(): Promise<Car[]> {
  const all = await getCars();
  return all.filter((c) => c.status === "active" && !c.deleted);
}
