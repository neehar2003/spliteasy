import Modal from './Modal';

/**
 * Generic confirmation dialog for destructive or balance-changing actions.
 * Usage: <ConfirmDialog title="..." message="..." onConfirm={...} onCancel={...} />
 */
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel} width={420}>
      <p className="muted">{message}</p>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
