import { useEffect, useMemo, useState } from "react";
import { IconInstructorCabinetVehicle } from "@/components/instructor/instructorCabinetSectionIcons";
import { subscribeCarsForInstructor, subscribeMaintenanceHistory } from "@/services/carService";
import type { Car, CarMaintenance } from "@/types/car";
import { useAuth } from "@/context/AuthContext";

function IconMini({ path }: { path: string }) {
  return (
    <svg className="instructor-cabinet-mini-ico" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d={path} />
    </svg>
  );
}

function formatRuDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

/**
 * Учебный автомобиль инструктора (из профиля).
 */
export function InstructorCabinetVehicleSection() {
  const { user, profile } = useAuth();
  const uid = (user?.uid ?? profile?.uid ?? "").trim();
  const [assignedCars, setAssignedCars] = useState<Car[]>([]);
  const assignedCar = assignedCars[0] ?? null;
  const [historyRows, setHistoryRows] = useState<CarMaintenance[]>([]);
  const kmLeft =
    assignedCar?.nextServiceDueMileage != null
      ? assignedCar.nextServiceDueMileage - assignedCar.mileage
      : null;
  const nearService = kmLeft != null && kmLeft >= 0 && kmLeft <= 50;
  const plannedLabel = useMemo(() => {
    if (!assignedCar || assignedCar.nextServiceDueMileage == null) return "Не задано";
    const typeLabel =
      assignedCar.nextServiceType === "oil_change"
        ? "Замена масла"
        : assignedCar.nextServiceType === "TO"
          ? "ТО"
          : assignedCar.nextServiceType === "repair"
            ? "Ремонт"
            : assignedCar.nextServiceType === "tyre_change"
              ? "Замена шин"
              : assignedCar.nextServiceType === "other"
                ? "Обслуживание"
                : "ТО";
    return `${typeLabel} на ${assignedCar.nextServiceDueMileage.toLocaleString("ru-RU")} км`;
  }, [assignedCar]);

  useEffect(() => {
    return subscribeCarsForInstructor(uid, setAssignedCars, () => setAssignedCars([]));
  }, [uid]);

  useEffect(() => {
    if (!assignedCar) {
      setHistoryRows([]);
      return;
    }
    return subscribeMaintenanceHistory(assignedCar.id, setHistoryRows, () => setHistoryRows([]));
  }, [assignedCar]);

  return (
    <section
      className="student-cabinet-card instructor-cabinet-block-surface instructor-cabinet-vehicle-section"
      aria-labelledby="instructor-cabinet-vehicle-title"
    >
      <h2
        id="instructor-cabinet-vehicle-title"
        className="student-cabinet-talon-head-title student-cab-title-with-ico instructor-cabinet-block-heading"
      >
        <IconInstructorCabinetVehicle className="instructor-cab-section-ico" />
        <span>Учебный автомобиль</span>
      </h2>
      {!assignedCar ? (
        <p className="field-hint instructor-cabinet-block-lead">
          Автомобиль пока не назначен администратором.
        </p>
      ) : (
        <>
          <div className="instructor-cabinet-vehicle-layout">
            <div className="instructor-cabinet-vehicle-photo-col">
              {assignedCar.photoDataUrl ? (
                <img
                  src={assignedCar.photoDataUrl}
                  alt=""
                  className="instructor-cabinet-vehicle-photo"
                />
              ) : (
                <div className="instructor-cabinet-vehicle-photo-fallback" aria-hidden>
                  🚗
                </div>
              )}
            </div>
            <div className="instructor-cabinet-vehicle-info-col">
              <p className="instructor-cabinet-vehicle-line">
                <IconMini path="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM5 11l1.5-4.5h11L19 11H5z" />
                <strong>Модель УТС:</strong>{" "}
                <span>
                  {assignedCar.brand} {assignedCar.model}
                </span>
              </p>
              <p className="instructor-cabinet-vehicle-line">
                <IconMini path="M20 8H4V6h16v2zm0 2v8H4v-8h16zm-6 2h-4v4h4v-4z" />
                <strong>Госномер:</strong> <span>{assignedCar.licensePlate}</span>
              </p>
              <p className="instructor-cabinet-vehicle-line">
                <IconMini path="M3 5h18v14H3V5zm2 2v10h14V7H5zm1 1h4v2H6V8zm0 3h12v2H6v-2z" />
                <strong>VIN:</strong> <span>{assignedCar.vin || "—"}</span>
              </p>
              <div className="instructor-cabinet-vehicle-docs-row">
                <IconMini path="M19 3H5c-1.1 0-2 .9-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2V5a2 2 0 00-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                <span className="instructor-cabinet-vehicle-docs-label">Документы:</span>
                <button
                  type="button"
                  className="student-cabinet-text-link instructor-cabinet-doc-link"
                  disabled={!assignedCar.osagoFileDataUrl}
                  onClick={() =>
                    assignedCar.osagoFileDataUrl &&
                    window.open(assignedCar.osagoFileDataUrl, "_blank", "noopener,noreferrer")
                  }
                >
                  ОСАГО
                </button>
                <button
                  type="button"
                  className="student-cabinet-text-link instructor-cabinet-doc-link"
                  disabled={!assignedCar.diagCardFileDataUrl}
                  onClick={() =>
                    assignedCar.diagCardFileDataUrl &&
                    window.open(assignedCar.diagCardFileDataUrl, "_blank", "noopener,noreferrer")
                  }
                >
                  ДК
                </button>
              </div>
            </div>
          </div>

          <div className="instructor-cabinet-vehicle-panel">
            <p className="instructor-cabinet-vehicle-line">
              <IconMini path="M12 2l4 4h-3v7h-2V6H8l4-4zm-7 13h14v7H5v-7zm2 2v3h10v-3H7z" />
              <strong>ТО: Запланированные:</strong>
            </p>
            <p className="instructor-cabinet-vehicle-planned-value">{plannedLabel}</p>
          </div>

          <div className="instructor-cabinet-vehicle-panel">
            <p className="instructor-cabinet-vehicle-line instructor-cabinet-vehicle-line--head">
              <IconMini path="M13 3a9 9 0 109 9h-2a7 7 0 11-7-7V3zm-1 4h2v6h-5v-2h3V7z" />
              <strong>История ТО</strong>
            </p>
            <div className="instructor-cabinet-vehicle-history-wrap">
              <table className="student-cabinet-talon-table instructor-cabinet-vehicle-history-table">
                <thead>
                  <tr>
                    <th>№ п/п</th>
                    <th>Дата</th>
                    <th>Пробег</th>
                    <th>Описание</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="student-cabinet-talon-table-empty">
                        Записей пока нет
                      </td>
                    </tr>
                  ) : (
                    historyRows.map((r, idx) => (
                      <tr key={r.id}>
                        <td>{idx + 1}</td>
                        <td>{formatRuDate(r.date)}</td>
                        <td>{r.mileage.toLocaleString("ru-RU")} км</td>
                        <td>{r.description.trim() || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {nearService ? (
        <p className="instructor-cabinet-vehicle-alert" role="status">
          Внимание: до следующего ТО осталось {kmLeft?.toLocaleString("ru-RU")} км.
          Сообщите администратору и запланируйте замену.
        </p>
      ) : null}
    </section>
  );
}
