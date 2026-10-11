import { useState } from 'react';
import { Button } from '../../components/Button';
import { Pagination } from '../../components/Pagination';
import { getLocalPlayerId } from '../../api/contracts';
import { useMatchHistory } from '../../api/hooks/useMatchHistory';
import './boards.css';

/** How the match ended, as shown to the player. */
const END_REASON_LABEL = { time: 'Time ran out', death: 'Defeated' } as const;

/**
 * The Match History tab: one page of the local player's finished
 * matches, newest first, across every config. Same four states and
 * pagination as the Ranking tab, with the same discreet "Updating…"
 * badge on refetches.
 */
export function MatchHistoryTab() {
  const playerId = getLocalPlayerId();
  const [page, setPage] = useState(1);
  const query = useMatchHistory(playerId ?? '', page);

  if (playerId === null) return <p className="board__status">No player profile on this device.</p>;
  if (query.isPending) return <p className="board__status">Loading match history…</p>;
  if (query.isError) {
    return (
      <div className="board__status board__status--error" role="alert">
        <p>Could not load the match history.</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const { items, total, pageSize } = query.data;
  if (total === 0) return <p className="board__status">No matches played yet.</p>;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="board">
      <p className="board__updating" role="status">
        {query.isFetching ? 'Updating…' : ''}
      </p>
      <div className="board__scroll">
        <table className="board__table" aria-label="Match History">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Score</th>
              <th scope="col">Duration</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {items.map((match) => (
              <tr key={match.id} className="board__row">
                <td>{new Date(match.playedAt).toLocaleString()}</td>
                <td>{match.score}</td>
                <td>{`${Math.round(match.durationSeconds)}s`}</td>
                <td>{END_REASON_LABEL[match.endReason]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
}

export default MatchHistoryTab;
