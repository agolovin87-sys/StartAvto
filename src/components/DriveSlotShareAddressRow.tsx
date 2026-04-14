import { useEffect, useState } from "react";
import {
  subscribeStudentDriveLocationShare,
  formatDriveShareAddressLine,
  type StudentDriveLocationShare,
} from "@/firebase/studentDriveLocationShare";

/** Иконка строки адреса (как в строках «Дата», «Статус»). */
function IconPendingAddress() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="drive-pending-row-ico">
      <path
        fill="currentColor"
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5.5z"
      />
    </svg>
  );
}

/** Тот же значок, что у кнопки «геолокация» справа в карточке (`StudentDriveLocationShareButton`). */
function IconGeoHintInline() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="drive-slot-share-hint-geo-ico"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"
      />
    </svg>
  );
}

/**
 * Одна подписка на share по слоту — строка «Адрес: …» под статусом в графике вождения.
 */
export function DriveSlotShareAddressRow({
  slotId,
  showStudentPendingHint = false,
}: {
  slotId: string;
  /** Курсант: если адреса ещё нет — показать подсказку с иконкой кнопки геолокации справа. */
  showStudentPendingHint?: boolean;
}) {
  const [share, setShare] = useState<StudentDriveLocationShare | null>(null);

  useEffect(() => {
    return subscribeStudentDriveLocationShare(slotId, setShare);
  }, [slotId]);

  const line = share ? formatDriveShareAddressLine(share) : null;
  if (line) {
    return (
      <div className="drive-pending-notice-row drive-slot-share-address-row">
        <IconPendingAddress />
        <span className="drive-pending-notice-row-text drive-slot-share-address-text">{line}</span>
      </div>
    );
  }

  if (showStudentPendingHint) {
    return (
      <div className="drive-pending-notice-row drive-slot-share-address-row drive-slot-share-address-row--hint">
        <IconPendingAddress />
        <span className="drive-pending-notice-row-text drive-slot-share-address-text">
          <span className="drive-pending-notice-label">Адрес:</span> Укажите адрес, нажмите на{" "}
          <span className="drive-slot-share-hint-geo-wrap" title="Кнопка геолокации">
            <IconGeoHintInline />
          </span>{" "}
          справа
        </span>
      </div>
    );
  }

  return null;
}
