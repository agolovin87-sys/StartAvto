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

/**
 * Одна подписка на share по слоту — строка «Адрес: …» под статусом в графике вождения.
 */
export function DriveSlotShareAddressRow({ slotId }: { slotId: string }) {
  const [share, setShare] = useState<StudentDriveLocationShare | null>(null);

  useEffect(() => {
    return subscribeStudentDriveLocationShare(slotId, setShare);
  }, [slotId]);

  const line = share ? formatDriveShareAddressLine(share) : null;
  if (!line) return null;

  return (
    <div className="drive-pending-notice-row drive-slot-share-address-row">
      <IconPendingAddress />
      <span className="drive-pending-notice-row-text drive-slot-share-address-text">{line}</span>
    </div>
  );
}
