import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import './Dialog.css';

/** Everything the Tab key can reach inside the dialog. */
const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  open: boolean;
  /** accessible name of the dialog, rendered as its heading */
  title: ReactNode;
  /** fired on any close — the owner must flip `open` to false */
  onClose: () => void;
  /**
   * false blocks Esc (only an explicit action may close it); default true.
   */
  dismissible?: boolean;
  children: ReactNode;
}

/**
 * Modal dialog on the native <dialog> element: showModal() brings the top
 * layer, makes everything outside inert (Tab stays inside), closes on Esc
 * (unless dismissible is false) and returns focus to the opener when
 * closed. On top of that, opening explicitly focuses the first focusable
 * element.
 */
export function Dialog({ open, title, onClose, dismissible = true, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
    return () => {
      if (dialog.open) dialog.close(); // Strict Mode remount / unmount cleanup
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (!dismissible) event.preventDefault();
      }}
      onClose={onClose}
    >
      <h2 id={titleId} className="dialog__title">
        {title}
      </h2>
      {children}
    </dialog>
  );
}

export default Dialog;
