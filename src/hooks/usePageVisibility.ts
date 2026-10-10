import { useEffect, useState } from 'react';

/**
 * True while the document is visible and the window has focus. Updates on
 * `visibilitychange` (tab hidden, window minimized) and on window `blur`
 * (another window took over) — the match auto-pauses when this turns
 * false. It never auto-resumes: coming back to the page only shows the
 * pause dialog again; resuming is always an explicit click.
 */
export function usePageVisibility(): boolean {
  const [active, setActive] = useState(
    () => document.visibilityState === 'visible' && document.hasFocus(),
  );

  useEffect(() => {
    const update = () => {
      setActive(document.visibilityState === 'visible' && document.hasFocus());
    };
    document.addEventListener('visibilitychange', update);
    window.addEventListener('blur', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('blur', update);
    };
  }, []);

  return active;
}
