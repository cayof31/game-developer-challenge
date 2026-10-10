import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { Button } from '../../components/Button';
import { SESSION_TIME_LIMITS, SPAWN_INTERVAL_LIMITS } from '../../config/limits';
import { loadOptions, saveOptions } from './optionsStorage';
import { validateSessionTime, validateSpawnInterval } from './optionsValidation';
import './OptionsScreen.css';

interface OptionsScreenProps {
  onBack: () => void;
}

const SESSION_ID = 'options-session-time';
const SPAWN_ID = 'options-spawn-interval';
const SESSION_ERROR_ID = `${SESSION_ID}-error`;
const SPAWN_ERROR_ID = `${SPAWN_ID}-error`;

type DraftField = 'sessionTimeSec' | 'spawnIntervalSec';
type FieldErrors = Record<DraftField, string | null>;

/**
 * The two player-facing options as labeled number fields. Values are
 * validated while typing and again on Save; an invalid field disables Save
 * and announces its message through aria-describedby + aria-invalid. A
 * successful save confirms politely via role="status" and persists to
 * localStorage (survives a refresh).
 */
export function OptionsScreen({ onBack }: OptionsScreenProps) {
  const [draft, setDraft] = useState(() => {
    const saved = loadOptions();
    return {
      sessionTimeSec: String(saved.sessionTimeSec),
      spawnIntervalSec: String(saved.spawnIntervalSec),
    };
  });
  const [errors, setErrors] = useState<FieldErrors>({
    sessionTimeSec: null,
    spawnIntervalSec: null,
  });
  const [savedMsg, setSavedMsg] = useState(false);

  const update =
    (field: DraftField, validate: (raw: string) => string | null) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      setDraft((current) => ({ ...current, [field]: raw }));
      setErrors((current) => ({ ...current, [field]: validate(raw) }));
      setSavedMsg(false); // stale confirmation after a new edit
    };

  const hasError = errors.sessionTimeSec !== null || errors.spawnIntervalSec !== null;

  const onSave = () => {
    // final gate: re-validate both fields even if nothing was typed
    const next: FieldErrors = {
      sessionTimeSec: validateSessionTime(draft.sessionTimeSec),
      spawnIntervalSec: validateSpawnInterval(draft.spawnIntervalSec),
    };
    setErrors(next);
    if (next.sessionTimeSec !== null || next.spawnIntervalSec !== null) return;
    saveOptions({
      sessionTimeSec: Number(draft.sessionTimeSec),
      spawnIntervalSec: Number(draft.spawnIntervalSec),
    });
    setSavedMsg(true);
  };

  return (
    <main className="screen">
      <div className="panel options">
        <h1>Options</h1>

        <div className="options__field">
          <label htmlFor={SESSION_ID}>Game session time</label>
          <input
            id={SESSION_ID}
            type="number"
            inputMode="numeric"
            min={SESSION_TIME_LIMITS.minSec}
            max={SESSION_TIME_LIMITS.maxSec}
            step={1}
            value={draft.sessionTimeSec}
            aria-invalid={errors.sessionTimeSec !== null}
            aria-describedby={errors.sessionTimeSec ? SESSION_ERROR_ID : undefined}
            onChange={update('sessionTimeSec', validateSessionTime)}
          />
          <p id={SESSION_ERROR_ID} className="options__error">
            {errors.sessionTimeSec}
          </p>
        </div>

        <div className="options__field">
          <label htmlFor={SPAWN_ID}>Enemy spawn time</label>
          <input
            id={SPAWN_ID}
            type="number"
            inputMode="decimal"
            min={SPAWN_INTERVAL_LIMITS.minSec}
            max={SPAWN_INTERVAL_LIMITS.maxSec}
            step={0.5}
            value={draft.spawnIntervalSec}
            aria-invalid={errors.spawnIntervalSec !== null}
            aria-describedby={errors.spawnIntervalSec ? SPAWN_ERROR_ID : undefined}
            onChange={update('spawnIntervalSec', validateSpawnInterval)}
          />
          <p id={SPAWN_ERROR_ID} className="options__error">
            {errors.spawnIntervalSec}
          </p>
        </div>

        <div className="options__actions">
          <Button variant="primary" onClick={onSave} disabled={hasError}>
            Save
          </Button>
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
        </div>
        <p role="status" className="options__saved">
          {savedMsg ? 'Options saved.' : ''}
        </p>
      </div>
    </main>
  );
}

export default OptionsScreen;
