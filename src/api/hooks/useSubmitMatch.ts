import { useMutation } from '@tanstack/react-query';
import type { SubmitMatchRequest } from '../contracts';
import { enqueueSubmission, sendPending } from '../pendingSubmissions';

/**
 * Registers a finished match through the pending queue: the record is
 * persisted FIRST, then the first send is kicked off — a tab closed
 * mid-send can never lose it. The queue owns what happens next (retry
 * scheduling on network/timeout/5xx, `failed` on a 4xx) and removes the
 * record on success, refreshing both lists on every success path.
 */
export function useSubmitMatch() {
  return useMutation({
    mutationFn: (record: SubmitMatchRequest): Promise<void> => {
      enqueueSubmission(record);
      return sendPending(record.id);
    },
  });
}

export default useSubmitMatch;
