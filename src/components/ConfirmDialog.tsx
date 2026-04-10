type AlertDialogProps = {
  open: boolean;
  title?: string;
  message: string;
  okLabel?: string;
  onClose: () => void;
};

/** Одно действие «Ок», закрывает окно. */
export function AlertDialog({ open, title, message, okLabel = "Ок", onClose }: AlertDialogProps) {
  if (!open) return null;

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={title ? "alert-dialog-title" : undefined}
        aria-describedby="alert-dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <h2 id="alert-dialog-title" className="confirm-dialog-title">
            {title}
          </h2>
        ) : null}
        <p id="alert-dialog-message" className="confirm-dialog-message">
          {message}
        </p>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

type ConfirmDialogProps = {
  open: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title = "Вы уверены?",
  message,
  confirmLabel = "Да",
  cancelLabel = "Нет",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="confirm-dialog-title">
          {title}
        </h2>
        {message ? <p className="confirm-dialog-message">{message}</p> : null}
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
