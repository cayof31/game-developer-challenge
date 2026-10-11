import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './styles/global.css'
import App from './App.tsx'
import { queryClient } from './api/queryClient'
import { worker } from './mocks/browser'

// The mock worker must be intercepting before the first fetch — TanStack
// Query hooks fire on mount, so the app mounts only after it started.
await worker.start()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
