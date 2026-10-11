import { QueryClient } from '@tanstack/react-query';

/**
 * The app-wide query client. Defaults favor a live scoreboard over
 * chattiness: data is stale after 30s, every focus and mount refetches
 * even fresh data (the scoreboard is current when the player comes back
 * to the tab), and a failing request retries twice before surfacing.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: 'always',
      refetchOnMount: 'always',
    },
  },
});
