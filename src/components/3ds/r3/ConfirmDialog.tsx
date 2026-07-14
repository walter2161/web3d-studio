import { R3Dialog, R3Button } from './R3Dialog';

interface Props {
  open: boolean;
  title?: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = ({
  open, title = 'Confirm', message, okLabel = 'Yes', cancelLabel = 'No', onConfirm, onCancel,
}: Props) => (
  <R3Dialog open={open} onClose={onCancel} title={title} width={340}>
    <div className="text-[11px] py-4 px-2">{message}</div>
    <div className="flex justify-end gap-1">
      <R3Button width={70} onClick={onConfirm}>{okLabel}</R3Button>
      <R3Button width={70} onClick={onCancel}>{cancelLabel}</R3Button>
    </div>
  </R3Dialog>
);
