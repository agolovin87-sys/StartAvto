import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Car, CarStatus } from "@/types/car";
import type { UserProfile } from "@/types";
import {
  createCar,
  deleteCarDocument,
  updateCar,
  uploadCarDocument,
  type CarInput,
} from "@/services/carService";

const BRANDS = ["LADA", "KIA", "Hyundai", "Renault", "Volkswagen"] as const;

const STATUS_OPTIONS: { value: CarStatus; label: string }[] = [
  { value: "active", label: "Активен" },
  { value: "maintenance", label: "На ТО" },
  { value: "repair", label: "Ремонт" },
  { value: "inactive", label: "Неактивен" },
];

type Props = {
  open: boolean;
  initial: Car | null;
  instructors: UserProfile[];
  onClose: () => void;
  onSaved: () => void;
};

function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, " ").trim();
}

export function CarFormModal({ open, initial, instructors, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [brand, setBrand] = useState("LADA");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(2020);
  const [licensePlate, setLicensePlate] = useState("");
  const [vin, setVin] = useState("");
  const [color, setColor] = useState("#c0c0c0");
  const [colorText, setColorText] = useState("Серый");
  const [status, setStatus] = useState<CarStatus>("active");
  const [mileage, setMileage] = useState(0);
  const [fuelLevel, setFuelLevel] = useState<number | "">("");
  const [maintenanceInterval, setMaintenanceInterval] = useState(10000);
  const [notes, setNotes] = useState("");
  const [instructorId, setInstructorId] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [osagoFileDataUrl, setOsagoFileDataUrl] = useState<string | null>(null);
  const [osagoFileName, setOsagoFileName] = useState<string | null>(null);
  const [osagoStoragePath, setOsagoStoragePath] = useState<string | null>(null);
  const [osagoFile, setOsagoFile] = useState<File | null>(null);
  const [osagoFromStr, setOsagoFromStr] = useState("");
  const [osagoToStr, setOsagoToStr] = useState("");
  const [diagCardFileDataUrl, setDiagCardFileDataUrl] = useState<string | null>(null);
  const [diagCardFileName, setDiagCardFileName] = useState<string | null>(null);
  const [diagCardStoragePath, setDiagCardStoragePath] = useState<string | null>(null);
  const [diagCardFile, setDiagCardFile] = useState<File | null>(null);
  const [diagCardDueStr, setDiagCardDueStr] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (initial) {
      setBrand(initial.brand || "LADA");
      setModel(initial.model);
      setYear(initial.year);
      setLicensePlate(initial.licensePlate);
      setVin(initial.vin);
      setColor(initial.color?.startsWith("#") ? initial.color : "#808080");
      setColorText(initial.color?.startsWith("#") ? "" : initial.color || "");
      setStatus(initial.status);
      setMileage(initial.mileage);
      setFuelLevel(initial.fuelLevel ?? "");
      setMaintenanceInterval(initial.maintenanceInterval);
      setNotes(initial.notes ?? "");
      setInstructorId(initial.instructorId ?? "");
      setPhotoDataUrl(initial.photoDataUrl ?? null);
      setOsagoFileDataUrl(initial.osagoFileDataUrl ?? null);
      setOsagoFileName(initial.osagoFileName ?? null);
      setOsagoStoragePath(initial.osagoStoragePath ?? null);
      setOsagoFile(null);
      setOsagoFromStr(
        initial.osagoFromDate
          ? new Date(initial.osagoFromDate).toISOString().slice(0, 10)
          : ""
      );
      setOsagoToStr(
        initial.osagoToDate
          ? new Date(initial.osagoToDate).toISOString().slice(0, 10)
          : ""
      );
      setDiagCardFileDataUrl(initial.diagCardFileDataUrl ?? null);
      setDiagCardFileName(initial.diagCardFileName ?? null);
      setDiagCardStoragePath(initial.diagCardStoragePath ?? null);
      setDiagCardFile(null);
      setDiagCardDueStr(
        initial.diagCardDueDate
          ? new Date(initial.diagCardDueDate).toISOString().slice(0, 10)
          : ""
      );
    } else {
      setBrand("LADA");
      setModel("");
      setYear(new Date().getFullYear());
      setLicensePlate("");
      setVin("");
      setColor("#c0c0c0");
      setColorText("Серый");
      setStatus("active");
      setMileage(0);
      setFuelLevel("");
      setMaintenanceInterval(10000);
      setNotes("");
      setInstructorId("");
      setPhotoDataUrl(null);
      setOsagoFileDataUrl(null);
      setOsagoFileName(null);
      setOsagoStoragePath(null);
      setOsagoFile(null);
      setOsagoFromStr("");
      setOsagoToStr("");
      setDiagCardFileDataUrl(null);
      setDiagCardFileName(null);
      setDiagCardStoragePath(null);
      setDiagCardFile(null);
      setDiagCardDueStr("");
    }
  }, [open, initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const plate = normalizePlate(licensePlate);
    if (plate.length < 4) {
      setErr("Укажите госномер.");
      return;
    }
    if (vin.length > 0 && vin.length !== 17) {
      setErr("VIN должен содержать 17 символов или оставьте пустым.");
      return;
    }
    const osagoFromMs = osagoFromStr ? new Date(`${osagoFromStr}T00:00:00`).getTime() : null;
    const osagoToMs = osagoToStr ? new Date(`${osagoToStr}T00:00:00`).getTime() : null;
    const diagDueMs = diagCardDueStr ? new Date(`${diagCardDueStr}T00:00:00`).getTime() : null;
    if ((osagoFromMs == null) !== (osagoToMs == null)) {
      setErr("Для ОСАГО укажите обе даты: с и по.");
      return;
    }
    if (osagoFromMs != null && osagoToMs != null && osagoFromMs > osagoToMs) {
      setErr("Период ОСАГО указан неверно: дата начала позже даты окончания.");
      return;
    }
    const y = Math.min(2026, Math.max(1990, year));
    const ins = instructorId.trim();
    let instructorName: string | undefined;
    if (ins) {
      const p = instructors.find((i) => i.uid === ins);
      instructorName = p?.displayName;
    }
    const payloadBase: CarInput = {
      brand,
      model: model.trim(),
      year: y,
      licensePlate: plate,
      vin: vin.trim().toUpperCase(),
      color: colorText.trim() || color,
      instructorId: ins || null,
      instructorName,
      status,
      mileage: Math.max(0, mileage),
      fuelLevel: fuelLevel === "" ? undefined : Math.min(100, Math.max(0, fuelLevel)),
      lastMaintenanceDate: initial?.lastMaintenanceDate ?? null,
      nextMaintenanceDate: initial?.nextMaintenanceDate ?? null,
      nextServiceDueMileage: initial?.nextServiceDueMileage ?? null,
      maintenanceInterval: Math.max(1000, maintenanceInterval),
      notes: notes.trim() || undefined,
      photoDataUrl: photoDataUrl ?? null,
      osagoFileDataUrl: osagoFileDataUrl ?? null,
      osagoFileName: osagoFileName ?? null,
      osagoStoragePath: osagoStoragePath ?? null,
      osagoFromDate: osagoFromMs,
      osagoToDate: osagoToMs,
      diagCardFileDataUrl: diagCardFileDataUrl ?? null,
      diagCardFileName: diagCardFileName ?? null,
      diagCardStoragePath: diagCardStoragePath ?? null,
      diagCardDueDate: diagDueMs,
    };

    setBusy(true);
    try {
      const carId = initial?.id ?? (await createCar(payloadBase));
      let nextOsagoUrl = osagoFileDataUrl ?? null;
      let nextOsagoName = osagoFileName ?? null;
      let nextOsagoPath = osagoStoragePath ?? null;
      let nextDiagUrl = diagCardFileDataUrl ?? null;
      let nextDiagName = diagCardFileName ?? null;
      let nextDiagPath = diagCardStoragePath ?? null;

      if (osagoFile) {
        const up = await uploadCarDocument(osagoFile, "osago", carId);
        nextOsagoUrl = up.url;
        nextOsagoName = up.fileName;
        nextOsagoPath = up.path;
      }
      if (diagCardFile) {
        const up = await uploadCarDocument(diagCardFile, "diag", carId);
        nextDiagUrl = up.url;
        nextDiagName = up.fileName;
        nextDiagPath = up.path;
      }

      await updateCar(carId, {
        ...payloadBase,
        osagoFileDataUrl: nextOsagoUrl,
        osagoFileName: nextOsagoName,
        osagoStoragePath: nextOsagoPath,
        diagCardFileDataUrl: nextDiagUrl,
        diagCardFileName: nextDiagName,
        diagCardStoragePath: nextDiagPath,
      });

      if (osagoFile && initial?.osagoStoragePath && initial.osagoStoragePath !== nextOsagoPath) {
        await deleteCarDocument(initial.osagoStoragePath).catch(() => {});
      }
      if (diagCardFile && initial?.diagCardStoragePath && initial.diagCardStoragePath !== nextDiagPath) {
        await deleteCarDocument(initial.diagCardStoragePath).catch(() => {});
      }
      if (!osagoFileDataUrl && initial?.osagoStoragePath) {
        await deleteCarDocument(initial.osagoStoragePath).catch(() => {});
      }
      if (!diagCardFileDataUrl && initial?.diagCardStoragePath) {
        await deleteCarDocument(initial.diagCardStoragePath).catch(() => {});
      }
      onSaved();
      onClose();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  function onPhotoFile(f: File | null) {
    if (!f || !f.type.startsWith("image/")) {
      setPhotoDataUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const s = typeof reader.result === "string" ? reader.result : null;
      if (s && s.length < 2_500_000) setPhotoDataUrl(s);
      else setErr("Файл слишком большой (макс. ~2 МБ).");
    };
    reader.readAsDataURL(f);
  }

  function onDocFile(
    f: File | null,
    setFile: (v: File | null) => void,
    setName: (v: string | null) => void
  ) {
    if (!f) {
      setFile(null);
      setName(null);
      return;
    }
    if (f.size > 12 * 1024 * 1024) {
      setErr("Файл документа слишком большой (макс. 12 МБ).");
      return;
    }
    setFile(f);
    setName(f.name);
  }

  function openDataUrl(dataUrl: string | null) {
    if (!dataUrl) return;
    window.open(dataUrl, "_blank", "noopener,noreferrer");
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="admin-car-modal-overlay" role="presentation">
      <button
        type="button"
        className="admin-car-modal-backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div
        className="admin-car-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="car-form-title"
      >
        <h2 id="car-form-title" className="admin-car-modal-title">
          {initial ? "Редактировать автомобиль" : "Добавить автомобиль"}
        </h2>
        <form className="admin-car-form" onSubmit={(e) => void submit(e)}>
          {err ? (
            <div className="form-error" role="alert">
              {err}
            </div>
          ) : null}
          <div className="admin-car-form-grid">
            <label className="field">
              <span className="field-label">Фото</span>
              <input
                type="file"
                accept="image/*"
                className="input"
                onChange={(e) => onPhotoFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {photoDataUrl ? (
              <div className="admin-car-photo-preview">
                <img src={photoDataUrl} alt="" className="admin-car-photo-preview-img" />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPhotoDataUrl(null)}
                >
                  Убрать фото
                </button>
              </div>
            ) : null}

            <label className="field">
              <span className="field-label">Марка</span>
              <select
                className="input"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              >
                {BRANDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Модель</span>
              <input
                className="input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Granta"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Год выпуска</span>
              <input
                className="input"
                type="number"
                min={1990}
                max={new Date().getFullYear()}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Госномер</span>
              <input
                className="input"
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value)}
                placeholder="А123ВС 716"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">VIN (17 символов)</span>
              <input
                className="input"
                value={vin}
                maxLength={17}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                placeholder="XTA..."
              />
            </label>
            <div className="field field-span-2 admin-car-docs-block">
              <span className="field-label">Документы: ОСАГО</span>
              <input
                type="file"
                accept="image/*,application/pdf,.pdf"
                className="input"
                onChange={(e) =>
                  onDocFile(
                    e.target.files?.[0] ?? null,
                    setOsagoFile,
                    setOsagoFileName
                  )
                }
              />
              <div className="admin-car-docs-meta">
                {osagoFileName ? <span className="field-hint">{osagoFileName}</span> : null}
                {osagoFileDataUrl || osagoFile ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={!osagoFileDataUrl}
                      onClick={() => openDataUrl(osagoFileDataUrl)}
                    >
                      Открыть файл
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setOsagoFileDataUrl(null);
                        setOsagoFileName(null);
                        setOsagoStoragePath(null);
                        setOsagoFile(null);
                        setOsagoFromStr("");
                        setOsagoToStr("");
                      }}
                    >
                      Удалить файл
                    </button>
                  </>
                ) : null}
              </div>
              <div className="admin-car-docs-dates">
                <label className="field">
                  <span className="field-label">Срок страхования: с</span>
                  <input
                    type="date"
                    className="input"
                    value={osagoFromStr}
                    onChange={(e) => setOsagoFromStr(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field-label">по</span>
                  <input
                    type="date"
                    className="input"
                    value={osagoToStr}
                    onChange={(e) => setOsagoToStr(e.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="field field-span-2 admin-car-docs-block">
              <span className="field-label">Документы: Диагностическая карта</span>
              <input
                type="file"
                accept="image/*,application/pdf,.pdf"
                className="input"
                onChange={(e) =>
                  onDocFile(
                    e.target.files?.[0] ?? null,
                    setDiagCardFile,
                    setDiagCardFileName
                  )
                }
              />
              <div className="admin-car-docs-meta">
                {diagCardFileName ? <span className="field-hint">{diagCardFileName}</span> : null}
                {diagCardFileDataUrl || diagCardFile ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={!diagCardFileDataUrl}
                      onClick={() => openDataUrl(diagCardFileDataUrl)}
                    >
                      Открыть файл
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setDiagCardFileDataUrl(null);
                        setDiagCardFileName(null);
                        setDiagCardStoragePath(null);
                        setDiagCardFile(null);
                        setDiagCardDueStr("");
                      }}
                    >
                      Удалить файл
                    </button>
                  </>
                ) : null}
              </div>
              <label className="field">
                <span className="field-label">Срок действия до: дд.мм.гггг</span>
                <input
                  type="date"
                  className="input"
                  value={diagCardDueStr}
                  onChange={(e) => setDiagCardDueStr(e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span className="field-label">Цвет (палитра)</span>
              <input
                type="color"
                value={color.startsWith("#") ? color : "#808080"}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Цвет (текст)</span>
              <input
                className="input"
                value={colorText}
                onChange={(e) => setColorText(e.target.value)}
                placeholder="Белый"
              />
            </label>
            <label className="field">
              <span className="field-label">Статус</span>
              <select
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value as CarStatus)}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Пробег, км</span>
              <input
                className="input"
                type="number"
                min={0}
                value={mileage}
                onChange={(e) => setMileage(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span className="field-label">Топливо, %</span>
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                value={fuelLevel}
                placeholder="необязательно"
                onChange={(e) =>
                  setFuelLevel(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </label>
            <label className="field">
              <span className="field-label">Интервал ТО, км</span>
              <input
                className="input"
                type="number"
                min={1000}
                step={500}
                value={maintenanceInterval}
                onChange={(e) => setMaintenanceInterval(Number(e.target.value))}
              />
            </label>
            <label className="field field-span-2">
              <span className="field-label">Инструктор</span>
              <select
                className="input"
                value={instructorId}
                onChange={(e) => setInstructorId(e.target.value)}
              >
                <option value="">Не назначен</option>
                {instructors.map((i) => (
                  <option key={i.uid} value={i.uid}>
                    {i.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-span-2">
              <span className="field-label">Заметки</span>
              <textarea
                className="input"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>
          <div className="admin-car-form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "…" : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
