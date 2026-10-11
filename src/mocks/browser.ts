import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/**
 * The browser-side mock backend: a Service Worker that answers every
 * /api/* request with the in-memory mock db. main.tsx starts it before
 * mounting React, so no request ever escapes to the network.
 */
export const worker = setupWorker(...handlers);
