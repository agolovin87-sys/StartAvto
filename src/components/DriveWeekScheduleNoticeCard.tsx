/**
 * Недельный график подтверждённых вождений — тот же визуальный стиль,
 * что у карточки «Подтверждение записи» (панель, строки, статус, действия справа).
 */
import type { ReactNode, RefCallback } from "react";
import type { DriveSlot } from "@/types";
import { driveSlotCardDateTimeLabel, driveSlotCardTimeOnly } from "@/admin/scheduleFormat";
import {
  IconPendingClock,
  IconPendingDate,
  IconPendingPerson,
  IconPendingStatus,
} from "@/components/DrivePendingRowIcons";

function IconDeleteBooking() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  );
}

export function DriveWeekScheduleNoticeCard({
  slot,
  personRowLabel,
  personShortName,
  onCancel,
  cancelBusy,
  cancelAriaLabel = "Отменить вождение",
  /** «date» — день и дата; «time» — только время (для курсанта в недельном графике). */
  firstRow = "date",
  /** Строка «Статус:» — значение (по умолчанию «подтверждено»). */
  statusValue = (
    <span className="drive-scheduled-status-confirmed">подтверждено</span>
  ),
  /**
   * Кнопки справа: не передано — стандартная «Удалить»;
   * передан узел — свой набор; `null` — колонку скрыть.
   */
  customSideActions,
  /** Блок под карточкой (таймер инструктора). */
  belowCard,
  /** Строка под «Статус:» (например адрес после отправки геолокации). */
  belowStatusRow,
  /** ref на корневой `<li>` (прокрутка к карточке за минуту до начала). */
  listItemRef,
  /** Пульс зелёного свечения до старта live (см. `useDriveImminentWeekAlert`). */
  imminentAttention = false,
  /** Пульс, пока курсант не подтвердил начало live-сессии (инструктор уже нажал «Начать»). */
  liveAwaitingStudentAck = false,
}: {
  slot: DriveSlot;
  personRowLabel: string;
  personShortName: string;
  onCancel?: () => void;
  cancelBusy?: boolean;
  cancelAriaLabel?: string;
  firstRow?: "date" | "time";
  statusValue?: ReactNode;
  customSideActions?: ReactNode | null;
  belowCard?: ReactNode;
  belowStatusRow?: ReactNode;
  listItemRef?: RefCallback<HTMLLIElement>;
  imminentAttention?: boolean;
  liveAwaitingStudentAck?: boolean;
}) {
  const defaultDelete =
    onCancel != null ? (
      <button
        type="button"
        className="instr-side-btn glossy-btn student-pending-decline-btn"
        onClick={onCancel}
        disabled={cancelBusy}
        aria-label={cancelAriaLabel}
        title="Отменить"
      >
        <IconDeleteBooking />
      </button>
    ) : null;

  const sideCol =
    customSideActions !== undefined ? customSideActions : defaultDelete;

  return (
    <li
      ref={listItemRef}
      className={`drive-week-schedule-notice-item${
        imminentAttention ? " drive-week-schedule-notice-item--imminent" : ""
      }${liveAwaitingStudentAck ? " drive-week-schedule-notice-item--live-await-ack" : ""}`}
    >
      <div className="instructor-card instructor-card--student student-home-my-instructor">
        <div className="instructor-preview-bar">
          <div className="instructor-card-preview instructor-card-preview--student glossy-panel instructor-home-cadet-preview student-pending-drive-preview">
            <div className="student-pending-drive-main">
              <div className="drive-pending-notice-row">
                {firstRow === "time" ? <IconPendingClock /> : <IconPendingDate />}
                <span className="drive-pending-notice-row-text">
                  <span className="drive-pending-notice-label">
                    {firstRow === "time" ? "Время:" : "Дата:"}
                  </span>{" "}
                  {firstRow === "time"
                    ? driveSlotCardTimeOnly(slot)
                    : driveSlotCardDateTimeLabel(slot)}
                </span>
              </div>
              <div className="drive-pending-notice-row">
                <IconPendingPerson />
                <span className="drive-pending-notice-row-text">
                  <span className="drive-pending-notice-label">{personRowLabel}:</span>{" "}
                  {personShortName}
                </span>
              </div>
              <div className="drive-pending-notice-row">
                <IconPendingStatus />
                <span className="drive-pending-notice-row-text">
                  <span className="drive-pending-notice-label">Статус:</span> {statusValue}
                </span>
              </div>
              {belowStatusRow}
            </div>
          </div>
          {sideCol != null ? (
            <div className="instructor-preview-actions">{sideCol}</div>
          ) : null}
        </div>
      </div>
      {belowCard}
    </li>
  );
}
