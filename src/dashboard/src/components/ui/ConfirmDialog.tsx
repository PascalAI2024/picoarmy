import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './Dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel?: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const confirmButtonClasses =
    variant === 'destructive'
      ? `
          px-4 py-2 text-sm
          bg-status-offline/20 border border-status-offline
          text-status-offline
          hover:bg-status-offline/30
          transition-colors
        `
      : `
          px-4 py-2 text-sm
          bg-accent-cyan/20 border border-accent-cyan
          text-accent-cyan
          hover:bg-accent-cyan/30
          transition-colors
        `;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <button
            onClick={handleCancel}
            className="
              px-4 py-2 text-sm
              bg-bg-surface border border-border
              text-text-secondary
              hover:text-text-primary hover:border-border-hover
              transition-colors
            "
          >
            {cancelLabel}
          </button>

          <button onClick={handleConfirm} className={confirmButtonClasses}>
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
