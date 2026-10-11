import { useEffect } from 'react';
import { usePageVisibility } from '../../hooks/usePageVisibility';
import { flushSubmissions } from '../pendingSubmissions';

/**
 * Keeps the pending-submissions queue moving with the app's lifecycle:
 * on open (the boot refresh rides along), when the connection returns
 * and when the page regains focus — each trigger walks the queue and
 * resends what is waiting. Overlapping triggers are harmless: the queue
 * sends each id at most once at a time.
 */
export function usePendingSync(): void {
  const pageActive = usePageVisibility();

  // on open and whenever the page becomes visible and focused again
  useEffect(() => {
    if (pageActive) flushSubmissions();
  }, [pageActive]);

  // a dropped connection may have left items waiting
  useEffect(() => {
    window.addEventListener('online', flushSubmissions);
    return () => window.removeEventListener('online', flushSubmissions);
  }, []);
}
