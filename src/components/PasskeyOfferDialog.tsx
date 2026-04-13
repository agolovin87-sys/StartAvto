import { useState } from "react";
import { registerPasskey } from "@/utils/passkey";

type PasskeyOfferDialogProps = {
  open: boolean;
  uid: string;
  email: string;
  onDismiss: () => void;
  onRegistered: () => void;
};

export function PasskeyOfferDialog({
  open,
  uid,
  email,
  onDismiss,
  onRegistered,
}: PasskeyOfferDialogProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  async function onYes() {
    setErr(null);
    setBusy(true);
    try {
      await registerPasskey(email, uid);
      onRegistered();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось сохранить passkey");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onClick={() => !busy && onDismiss()}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onDismiss();
      }}
    >
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="passkey-offer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="passkey-offer-title" className="confirm-dialog-title">
          Сохранить биометрию для быстрого входа?
        </h2>
        <p className="confirm-dialog-message">
          На этом устройстве можно привязать вход по Face ID, Touch ID или ключу безопасности. Данные
          хранятся локально в браузере (демо-режим); для продакшена нужна проверка на сервере.
        </p>
        {err ? (
          <p className="confirm-dialog-message form-error" role="alert">
            {err}
          </p>
        ) : null}
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={onDismiss}
          >
            Не сейчас
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onYes}>
            {busy ? "Настройка…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
