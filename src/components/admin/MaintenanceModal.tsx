import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Car, CarMaintenance, CarMaintenanceType } from "@/types/car";
import { addMaintenanceRecord, updateMaintenanceRecord } from "@/services/carService";

const TYPE_OPTIONS: { value: CarMaintenanceType; label: string }[] = [
  { value: "TO", label: "ТО" },
  { value: "oil_change", label: "Замена масла" },
  { value: "repair", label: "Ремонт" },
  { value: "tyre_change", label: "Замена шин" },
  { value: "other", label: "Другое" },
];

type Props = {
  open: boolean;
  car: Car | null;
  editRecord?: CarMaintenance | null;
  onClose: () => void;
  onSaved: () => void;
};

export function MaintenanceModal({ open, car, editRecord, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState("");
  const [type, setType] = useState<CarMaintenanceType>("TO");
  const [mileage, setMileage] = useState(0);
  const [nextMileage, setNextMileage] = useState(0);
  const [cost, setCost] = useState(0);
  const [description, setDescription] = useState("");
  const oilChangeSelected = type === "oil_change";

  useEffect(() => {
    if (!open || !car) return;
    setErr(null);
    const d = new Date();
    setDateStr(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
    if (editRecord) {
      const rd = new Date(editRecord.date);
      setDateStr(
        `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, "0")}-${String(rd.getDate()).padStart(2, "0")}`
      );
      setType(editRecord.type);
      setMileage(editRecord.mileage);
      setNextMileage(editRecord.nextMileage);
      setCost(editRecord.cost);
      setDescription(editRecord.description);
      return;
    }
    setType("TO");
    setMileage(car.mileage);
    const interval = Math.max(1000, car.maintenanceInterval);
    setNextMileage(car.mileage + interval);
    setCost(0);
    setDescription("");
  }, [open, car, editRecord]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!car) return;
    setErr(null);
    const [y, m, day] = dateStr.split("-").map(Number);
    if (!y || !m || !day) {
      setErr("Укажите дату.");
      return;
    }
    const at = new Date(y, m - 1, day).getTime();
    if (oilChangeSelected && nextMileage < mileage) {
      setErr("Пробег до следующей замены не может быть меньше пробега на момент записи.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        date: at,
        type,
        mileage: Math.max(0, mileage),
        cost: Math.max(0, cost),
        description: description.trim(),
        nextMileage: oilChangeSelected ? Math.max(0, nextMileage) : Math.max(0, mileage),
      };
      if (editRecord) await updateMaintenanceRecord(car.id, editRecord.id, payload);
      else await addMaintenanceRecord(car.id, payload);
      onSaved();
      onClose();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (!open || !car || typeof document === "undefined") return null;

  const interval = Math.max(1000, car.maintenanceInterval);

  return createPortal(
    <div className="admin-car-modal-overlay" role="presentation">
      <button
        type="button"
        className="admin-car-modal-backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div
        className="admin-car-modal-card admin-car-modal-card--sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="maint-form-title"
      >
        <h2 id="maint-form-title" className="admin-car-modal-title">
          {editRecord ? "Изменить запись ТО" : "Запись о ТО"} · {car.licensePlate}
        </h2>
        <form className="admin-car-form" onSubmit={(e) => void submit(e)}>
          {err ? (
            <div className="form-error" role="alert">
              {err}
            </div>
          ) : null}
          <label className="field">
            <span className="field-label">Дата</span>
            <input
              type="date"
              className="input"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Тип</span>
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value as CarMaintenanceType)}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Пробег на момент записи, км</span>
            <input
              type="number"
              className="input"
              min={0}
              value={mileage}
              onChange={(e) => setMileage(Number(e.target.value))}
              required
            />
          </label>
          {oilChangeSelected ? (
            <label className="field">
              <span className="field-label">Пробег до следующей замены, км</span>
              <input
                type="number"
                className="input"
                min={0}
                value={nextMileage}
                onChange={(e) => setNextMileage(Number(e.target.value))}
                required
              />
            </label>
          ) : null}
          <label className="field">
            <span className="field-label">Стоимость, ₽</span>
            <input
              type="number"
              className="input"
              min={0}
              value={cost}
              onChange={(e) => setCost(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="field-label">Описание</span>
            <textarea
              className="input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {oilChangeSelected ? (
            <p className="field-hint admin-car-maint-hint">
              Интервал ТО по карточке авто: <strong>{interval.toLocaleString("ru-RU")} км</strong>.
              Укажите целевой пробег для следующей замены вручную.
            </p>
          ) : null}
          <div className="admin-car-form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "…" : editRecord ? "Сохранить изменения" : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
