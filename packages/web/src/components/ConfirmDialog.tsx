interface ConfirmDialogProps {
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Diálogo de confirmação genérico (confirmação em vermelho). */
export function ConfirmDialog({ text, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="dialog">
        <p className="dialog__text">{text}</p>
        <div className="dialog__actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="button--danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
