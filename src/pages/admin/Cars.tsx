/**
 * Управление учебными автомобилями (админ).
 * Подключается на вкладке «Главная» под блоком «Группы».
 */
import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CarFormModal } from "@/components/admin/CarFormModal";
import { CarMaintenanceHistory } from "@/components/admin/CarMaintenanceHistory";
import { MaintenanceModal } from "@/components/admin/MaintenanceModal";
import { formatShortFio } from "@/admin/formatShortFio";
import { subscribeInstructors } from "@/firebase/admin";
import {
  assignInstructor,
  deleteCar,
} from "@/services/carService";
import { useCars } from "@/hooks/useCars";
import type { Car, CarMaintenance, CarStatus } from "@/types/car";
import type { UserProfile } from "@/types";

const STATUS_LABEL: Record<CarStatus, string> = {
  active: "Активен",
  maintenance: "На ТО",
  repair: "Ремонт",
  inactive: "Неактивен",
};

const PAGE_SIZE = 10;

function kmUntilService(car: Car): number | null {
  if (car.nextServiceDueMileage == null) return null;
  return car.nextServiceDueMileage - car.mileage;
}

export function AdminCarsPanel() {
  const { cars, loading, error, refresh } = useCars();
  const [instructors, setInstructors] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CarStatus>("all");
  const [instructorFilter, setInstructorFilter] = useState<"all" | "assigned" | "unassigned">(
    "all"
  );
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Car | null>(null);

  const [historyCar, setHistoryCar] = useState<Car | null>(null);
  const [maintCar, setMaintCar] = useState<Car | null>(null);
  const [editingMaint, setEditingMaint] = useState<CarMaintenance | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Car | null>(null);
  const [assignBusy, setAssignBusy] = useState<string | null>(null);

  useEffect(() => {
    return subscribeInstructors(setInstructors, () => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cars.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (instructorFilter === "assigned" && !c.instructorId) return false;
      if (instructorFilter === "unassigned" && c.instructorId) return false;
      if (!q) return true;
      const hay = [
        c.brand,
        c.model,
        c.licensePlate,
        c.instructorName ?? "",
        c.vin,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [cars, search, statusFilter, instructorFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const dueSoonCount = useMemo(
    () =>
      cars.filter((c) => {
        const left = kmUntilService(c);
        return left != null && left >= 0 && left <= 50;
      }).length,
    [cars]
  );

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, instructorFilter]);

  async function onAssign(car: Car, instructorId: string) {
    setAssignBusy(car.id);
    try {
      const ins = instructorId.trim();
      if (!ins) {
        await assignInstructor(car.id, null);
      } else {
        const p = instructors.find((i) => i.uid === ins);
        await assignInstructor(car.id, ins, p?.displayName ?? null);
      }
      await refresh();
    } finally {
      setAssignBusy(null);
    }
  }

  return (
    <div className="admin-cars-root">
      {error ? (
        <div className="form-error" role="alert">
          {error}
          {" — "}
          <span className="field-hint">
            Проверьте правила Firestore для коллекции <code>cars</code>.
          </span>
        </div>
      ) : null}
      {dueSoonCount > 0 ? (
        <div className="admin-cars-service-alert" role="status">
          Внимание: {dueSoonCount} авто до ТО за 50 км. Сообщение отображается администратору и
          закреплённому инструктору.
        </div>
      ) : null}

      <div className="admin-cars-toolbar">
        <input
          type="search"
          className="input admin-cars-search"
          placeholder="Поиск: модель, номер, инструктор…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Поиск по автомобилям"
        />
        <select
          className="input admin-cars-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="all">Все статусы</option>
          <option value="active">Активны</option>
          <option value="maintenance">На ТО</option>
          <option value="repair">Ремонт</option>
          <option value="inactive">Неактивны</option>
        </select>
        <select
          className="input admin-cars-filter"
          value={instructorFilter}
          onChange={(e) => setInstructorFilter(e.target.value as typeof instructorFilter)}
        >
          <option value="all">Все авто</option>
          <option value="assigned">С инструктором</option>
          <option value="unassigned">Без инструктора</option>
        </select>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Добавить автомобиль
        </button>
      </div>

      <div className="admin-schedule-table-wrap admin-cars-table-wrap">
        <table className="admin-schedule-table admin-cars-table">
          <thead>
            <tr>
              <th>Фото</th>
              <th>Модель</th>
              <th>Госномер</th>
              <th>Инструктор</th>
              <th>Статус</th>
              <th>Пробег</th>
              <th>ТО</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="admin-schedule-table-empty">
                  Загрузка…
                </td>
              </tr>
            ) : slice.length === 0 ? (
              <tr>
                <td colSpan={8} className="admin-schedule-table-empty">
                  Нет автомобилей по фильтрам.
                </td>
              </tr>
            ) : (
              slice.map((c) => {
                const kmLeft = kmUntilService(c);
                const warn =
                  kmLeft != null && kmLeft >= 0 && kmLeft <= 50 && c.status === "active";
                return (
                  <tr key={c.id}>
                    <td className="admin-cars-td-photo">
                      {c.photoDataUrl ? (
                        <img src={c.photoDataUrl} alt="" className="admin-cars-thumb" />
                      ) : (
                        <span className="admin-cars-thumb-fallback" aria-hidden>
                          🚗
                        </span>
                      )}
                    </td>
                    <td>
                      <strong>
                        {c.brand} {c.model}
                      </strong>
                      <div className="admin-cars-sub">{c.year} г.</div>
                    </td>
                    <td>
                      <code className="admin-cars-plate">{c.licensePlate}</code>
                    </td>
                    <td>
                      <select
                        className="input input-inline admin-cars-assign-select"
                        value={c.instructorId ?? ""}
                        disabled={assignBusy === c.id}
                        onChange={(e) => void onAssign(c, e.target.value)}
                        aria-label="Назначить инструктора"
                      >
                        <option value="">Не назначен</option>
                        {instructors.map((i) => (
                          <option key={i.uid} value={i.uid}>
                            {formatShortFio(i.displayName)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span
                        className={[
                          "admin-cars-status",
                          `admin-cars-status--${c.status}`,
                        ].join(" ")}
                      >
                        {STATUS_LABEL[c.status]}
                      </span>
                    </td>
                    <td>{c.mileage.toLocaleString("ru-RU")} км</td>
                    <td>
                      {c.nextServiceDueMileage != null ? (
                        <span className={warn ? "admin-cars-to-warn" : ""}>
                          до {c.nextServiceDueMileage.toLocaleString("ru-RU")} км
                          {kmLeft != null ? (
                            <span className="admin-cars-to-left">
                              {" "}
                              (осталось {kmLeft.toLocaleString("ru-RU")} км)
                            </span>
                          ) : null}
                          {warn ? <span className="admin-cars-to-badge"> ≤50 км</span> : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <div className="admin-cars-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setEditing(c);
                            setFormOpen(true);
                          }}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setHistoryCar(c)}
                        >
                          История ТО
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setEditingMaint(null);
                            setMaintCar(c);
                          }}
                        >
                          + ТО
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setDeleteTarget(c)}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="admin-cars-pager">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Назад
          </button>
          <span className="admin-cars-pager-info">
            Стр. {safePage} из {totalPages} · всего {filtered.length}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Вперёд
          </button>
        </div>
      ) : null}

      <CarFormModal
        open={formOpen}
        initial={editing}
        instructors={instructors}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={() => void refresh()}
      />

      <CarMaintenanceHistory
        open={historyCar != null}
        car={historyCar}
        onClose={() => setHistoryCar(null)}
        onAddClick={() => {
          if (historyCar) {
            setEditingMaint(null);
            setMaintCar(historyCar);
          }
        }}
        onEditClick={(row) => {
          if (!historyCar) return;
          setEditingMaint(row);
          setMaintCar(historyCar);
        }}
      />

      <MaintenanceModal
        open={maintCar != null}
        car={maintCar}
        editRecord={editingMaint}
        onClose={() => {
          setMaintCar(null);
          setEditingMaint(null);
        }}
        onSaved={() => void refresh()}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        title="Удалить автомобиль?"
        message={
          deleteTarget
            ? `Скрыть «${deleteTarget.brand} ${deleteTarget.model}» (${deleteTarget.licensePlate}) из списка?`
            : undefined
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        onConfirm={() => {
          const t = deleteTarget;
          setDeleteTarget(null);
          if (t) void deleteCar(t.id).then(() => refresh());
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default AdminCarsPanel;
