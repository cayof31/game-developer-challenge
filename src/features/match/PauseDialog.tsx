import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import './PauseDialog.css';

interface PauseDialogProps {
  open: boolean;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
}

/**
 * The pause menu. It mirrors the simulation status (the bridge publishes
 * 'paused'), and it only closes through an explicit click on one of its
 * buttons — Esc is blocked (`dismissible={false}`), so resuming can never
 * happen by accident or by key.
 */
export function PauseDialog({ open, onResume, onRestart, onMainMenu }: PauseDialogProps) {
  return (
    <Dialog
      open={open}
      title="Paused"
      dismissible={false}
      onClose={() => {
        /* the status flips before the dialog closes — nothing to sync */
      }}
    >
      <div className="pause-dialog__actions">
        <Button onClick={onResume}>Resume</Button>
        <Button variant="secondary" onClick={onRestart}>
          Restart
        </Button>
        <Button variant="secondary" onClick={onMainMenu}>
          Main Menu
        </Button>
      </div>
    </Dialog>
  );
}

export default PauseDialog;
