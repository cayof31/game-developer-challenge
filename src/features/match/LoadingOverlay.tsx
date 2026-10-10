import type { CSSProperties } from 'react';

interface LoadingOverlayProps {
  phase: 'loading' | 'error';
  progress: number;
  error: string | null;
  onRetry: () => void;
}

const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#113f52',
  color: '#f5efe0',
  fontFamily: 'system-ui, sans-serif',
};

const boxStyle: CSSProperties = { textAlign: 'center' };

/** Covers the canvas while assets load (progress) or after a failure (Retry). */
export function LoadingOverlay({ phase, progress, error, onRetry }: LoadingOverlayProps) {
  return (
    <div style={overlayStyle} role="status" aria-live="polite">
      <div style={boxStyle}>
        {phase === 'error' ? (
          <>
            <p>{error ?? 'Failed to load the game'}</p>
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </>
        ) : (
          <>
            <p>Loading… {Math.round(progress * 100)}%</p>
            <progress value={progress} max={1} />
          </>
        )}
      </div>
    </div>
  );
}

export default LoadingOverlay;
