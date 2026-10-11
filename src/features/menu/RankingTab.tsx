import { useState } from 'react';
import { Button } from '../../components/Button';
import { Pagination } from '../../components/Pagination';
import { getLocalPlayerId } from '../../api/contracts';
import { useRanking } from '../../api/hooks/useRanking';
import { loadOptions } from '../options/optionsStorage';
import './boards.css';

/**
 * The Ranking tab: one page of the leaderboard for the options in
 * effect. Four states — loading, empty, error (Retry under
 * role="alert") and data — plus Previous/Next pagination that disables
 * at the edges, a discreet "Updating…" badge while a refetch runs (the
 * rows already on screen are never hidden by it), and the local
 * player's rows highlighted.
 */
export function RankingTab() {
  const { sessionTimeSec, spawnIntervalSec } = loadOptions();
  const [page, setPage] = useState(1);
  const query = useRanking({ sessionTimeSec, spawnIntervalSec, page });

  if (query.isPending) return <p className="board__status">Loading ranking…</p>;
  if (query.isError) {
    return (
      <div className="board__status board__status--error" role="alert">
        <p>Could not load the ranking.</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const { items, total, pageSize } = query.data;
  if (total === 0) return <p className="board__status">No matches ranked yet.</p>;

  const me = getLocalPlayerId();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="board">
      <p className="board__updating" role="status">
        {query.isFetching ? 'Updating…' : ''}
      </p>
      <div className="board__scroll">
        <table className="board__table" aria-label="Ranking">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => {
              const isMe = entry.playerId === me;
              return (
                <tr
                  key={entry.rank}
                  className={isMe ? 'board__row board__row--me' : 'board__row'}
                  aria-current={isMe ? 'true' : undefined}
                >
                  <td>{entry.rank}</td>
                  <td>
                    {entry.playerName}
                    {isMe ? ' (You)' : null}
                  </td>
                  <td>{entry.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
}

export default RankingTab;
