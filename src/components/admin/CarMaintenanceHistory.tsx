import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Car, CarMaintenance, CarMaintenanceType } from "@/types/car";
import { deleteMaintenanceRecord, subscribeMaintenanceHistory } from "@/services/carService";

const TYPE_LABEL: Record<CarMaintenanceType, string> = {
  TO: "ТО",
  repair: "Ремонт",
  tyre_change: "Замена шин",
  other: "Другое",
};

function formatRuDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function exportCsv(rows: CarMaintenance[], carPlate: string) {
  const header = ["Дата", "Тип", "Пробег", "Стоимость", "Описание", "До след. ТО (км)"];
  const lines = [header.join(";")];
  for (const r of rows) {
    lines.push(
      [
        formatRuDate(r.date),
        TYPE_LABEL[r.type],
        String(r.mileage),
        String(r.cost),
        r.description.replace(/;/g, ","),
        String(r.nextMileage),
      ].join(";")
    );
  }
  const bom = "\uFEFF";
  const blob = new Blob([bom + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `to-history-${carPlate.replace(/\s+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type Props = {
  open: boolean;
  car: Car | null;
  onClose: () => void;
  onAddClick: () => void;
  onEditClick: (row: CarMaintenance) => void;
};

export function CarMaintenanceHistory({
  open,
  car,
  onClose,
  onAddClick,
  onEditClick,
}: Props) {
  const [rows, setRows] = useState<CarMaintenance[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [descOpen, setDescOpen] = useState(false);
  const [descText, setDescText] = useState("");

  useEffect(() => {
    if (!open || !car) {
      setRows([]);
      return;
    }
    setErr(null);
    return subscribeMaintenanceHistory(
      car.id,
      setRows,
      (e) => setErr(e.message)
    );
  }, [open, car]);

  const sorted = useMemo(() => [...rows].sort((a, b) => b.date - a.date), [rows]);

  if (!open || !car || typeof document === "undefined") return null;

  return createPortal(
    <div className="admin-car-modal-overlay" role="presentation">
      <button
        type="button"
        className="admin-car-modal-backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div
        className="admin-car-modal-card admin-car-modal-card--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="car-maint-hist-title"
      >
        <div className="admin-car-maint-head">
          <h2 id="car-maint-hist-title" className="admin-car-modal-title">
            История ТО · {car.licensePlate}
          </h2>
          <div className="admin-car-maint-head-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onAddClick}>
              Добавить запись
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={sorted.length === 0}
              onClick={() => exportCsv(sorted, car.licensePlate)}
            >
              Экспорт CSV
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>
        {err ? (
          <div className="form-error" role="alert">
            {err}
          </div>
        ) : null}
        <div className="admin-schedule-table-wrap admin-car-maint-table-wrap">
          <table className="admin-schedule-table admin-car-maint-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Пробег</th>
                <th>Стоимость</th>
                <th>До след. ТО</th>
                <th>Описание</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-schedule-table-empty">
                    Записей пока нет.
                  </td>
                </tr>
              ) : (
                sorted.map((r) => (
                  <tr key={r.id}>
                    <td>{formatRuDate(r.date)}</td>
                    <td>{TYPE_LABEL[r.type]}</td>
                    <td>{r.mileage.toLocaleString("ru-RU")}</td>
                    <td>{r.cost.toLocaleString("ru-RU")} ₽</td>
                    <td>{r.nextMileage.toLocaleString("ru-RU")} км</td>
                    <td className="admin-car-maint-desc">
                      {r.description.trim() ? (
                        <button
                          type="button"
                          className="student-cabinet-text-link admin-car-maint-desc-btn"
                          onClick={() => {
                            setDescText(r.description.trim());
                            setDescOpen(true);
                          }}
                        >
                          Посмотреть
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <div className="admin-cars-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => onEditClick(r)}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={deleteBusyId === r.id}
                          onClick={() => {
                            const ok = window.confirm("Удалить эту запись ТО?");
                            if (!ok) return;
                            setDeleteBusyId(r.id);
                            void deleteMaintenanceRecord(car.id, r.id)
                              .catch((e: unknown) =>
                                setErr(e instanceof Error ? e.message : "Не удалось удалить запись")
                              )
                              .finally(() => setDeleteBusyId(null));
                          }}
                        >
                          {deleteBusyId === r.id ? "…" : "Удалить"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {descOpen ? (
        <div className="admin-car-modal-overlay" role="presentation">
          <button
            type="button"
            className="admin-car-modal-backdrop"
            aria-label="Закрыть"
            onClick={() => setDescOpen(false)}
          />
          <div
            className="admin-car-modal-card admin-car-modal-card--sm admin-car-maint-desc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="car-maint-desc-title"
          >
            <h3 id="car-maint-desc-title" className="admin-car-modal-title">
              Описание ТО
            </h3>
            <p className="admin-car-maint-desc-text">{descText}</p>
            <div className="admin-car-form-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setDescOpen(false)}
              >
                Ок
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  );
}
