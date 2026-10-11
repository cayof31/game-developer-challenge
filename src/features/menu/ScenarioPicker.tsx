import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clearSubmissions } from '../../api/pendingSubmissions';
import { queryKeys } from '../../api/queryKeys';
import { clearRecords } from '../../mocks/db';
import { seedRecords } from '../../mocks/fixtures/seedRecords';
import { getScenarioName, SCENARIOS, setScenario, type ScenarioName } from '../../mocks/scenarios';
import './ScenarioPicker.css';

/** `?debug=1` opens the panel straight away, without the button. */
function isDebugUrl(): boolean {
  if (typeof location === 'undefined') return false; // Node checks
  return new URLSearchParams(location.search).get('debug') === '1';
}

/**
 * The mock-backend debug panel: pick a scenario (mocks/scenarios.ts) and
 * reset the mock. Reachable through the discreet Debug button on the
 * main menu, or straight away with `?debug=1`. Picking a scenario takes
 * effect on the next request AND reloads the mounted lists; Reset empties
 * the mock's localStorage (records, scenario and the pending queue),
 * restores the 28 fixture matches and reloads the queries.
 */
export function ScenarioPicker() {
  const [open, setOpen] = useState(isDebugUrl);
  const [scenario, setScenarioState] = useState<ScenarioName>(() => getScenarioName());
  const queryClient = useQueryClient();

  const reloadQueries = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.rankingPrefix });
    void queryClient.invalidateQueries({ queryKey: queryKeys.historyPrefix });
  };

  const onPick = (name: ScenarioName) => {
    setScenarioState(name);
    setScenario(name);
    reloadQueries();
  };

  const onReset = () => {
    clearRecords();
    clearSubmissions();
    setScenarioState('success');
    setScenario('success');
    seedRecords();
    reloadQueries();
  };

  return (
    <div className="debug">
      <button
        type="button"
        className="debug__toggle"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        Debug
      </button>
      {open && (
        <div className="debug__panel" role="group" aria-label="Mock scenarios">
          <label className="debug__label" htmlFor="debug-scenario">
            Scenario
          </label>
          <select
            id="debug-scenario"
            className="debug__select"
            value={scenario}
            onChange={(event) => onPick(event.target.value as ScenarioName)}
          >
            {Object.keys(SCENARIOS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" className="debug__reset" onClick={onReset}>
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

export default ScenarioPicker;
