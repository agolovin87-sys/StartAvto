import { ClientCacheClearPanel } from "@/components/ClientCacheClearPanel";
import { VibrationIncomingSettingRow } from "@/components/VibrationIncomingSettingRow";

export function StudentSettingsTab() {
  return (
    <div className="dashboard student-settings-tab">
      <h1 className="dashboard-title">Настройки</h1>
      <p className="dashboard-lead">
        Параметры сохраняются только на этом устройстве.
      </p>
      <div className="admin-settings-policy-block">
        <h4 className="admin-settings-policy-heading">Уведомления</h4>
        <VibrationIncomingSettingRow />
      </div>
      <div className="admin-settings-policy-block student-settings-memory-block">
        <h4 className="admin-settings-policy-heading">Память</h4>
        <ClientCacheClearPanel
          description={
            <>
              Очистка черновиков чата и локальных кэшей браузера на этом устройстве. Вход и настройки из этого
              экрана сохраняются.
            </>
          }
        />
      </div>
    </div>
  );
}
