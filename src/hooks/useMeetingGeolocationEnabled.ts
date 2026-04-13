import { useEffect, useState } from "react";
import {
  getMeetingGeolocationEnabled,
  subscribeMeetingGeolocationSettings,
} from "@/admin/meetingGeolocationSettings";

export function useMeetingGeolocationEnabled(uid: string): boolean {
  const [enabled, setEnabled] = useState(() =>
    uid ? getMeetingGeolocationEnabled(uid) : true
  );

  useEffect(() => {
    setEnabled(uid ? getMeetingGeolocationEnabled(uid) : true);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return subscribeMeetingGeolocationSettings(() => {
      setEnabled(getMeetingGeolocationEnabled(uid));
    });
  }, [uid]);

  return enabled;
}
