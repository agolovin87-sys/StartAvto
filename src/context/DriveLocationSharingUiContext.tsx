import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  DEFAULT_DRIVE_LOCATION_SHARING_SETTINGS,
  subscribeDriveLocationSharingSettings,
  type DriveLocationSharingSettings,
} from "@/firebase/driveLocationSharingSettings";

type Ctx = DriveLocationSharingSettings & {
  /** Первый снимок с Firestore получен (или ошибка / офлайн-фолбэк). */
  ready: boolean;
};

const DriveLocationSharingUiContext = createContext<Ctx | null>(null);

export function DriveLocationSharingUiProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<DriveLocationSharingSettings>({
    ...DEFAULT_DRIVE_LOCATION_SHARING_SETTINGS,
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setSettings({ ...DEFAULT_DRIVE_LOCATION_SHARING_SETTINGS });
      setReady(false);
      return;
    }
    return subscribeDriveLocationSharingSettings(
      (v) => {
        setSettings(v);
        setReady(true);
      },
      () => {
        setSettings({ ...DEFAULT_DRIVE_LOCATION_SHARING_SETTINGS });
        setReady(true);
      }
    );
  }, [user?.uid]);

  const value = useMemo(
    () => ({
      ...settings,
      ready,
    }),
    [settings.instructorsEnabled, settings.studentsEnabled, ready]
  );

  return (
    <DriveLocationSharingUiContext.Provider value={value}>{children}</DriveLocationSharingUiContext.Provider>
  );
}

export function useDriveLocationSharingUi(): Ctx {
  const ctx = useContext(DriveLocationSharingUiContext);
  if (!ctx) {
    throw new Error("useDriveLocationSharingUi: провайдер не подключён");
  }
  return ctx;
}
