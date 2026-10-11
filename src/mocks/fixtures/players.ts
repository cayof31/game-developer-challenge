/** A fixture player shared by the seed records. */
export interface FixturePlayer {
  readonly playerId: string;
  readonly playerName: string;
}

/**
 * The fake roster behind the seed records. Ids are fixed (and valid
 * uuid v4 shape) so rankings and history are byte-for-byte reproducible
 * across runs and machines.
 */
export const FIXTURE_PLAYERS: readonly FixturePlayer[] = [
  { playerId: 'a1b2c3d4-0000-4000-8000-000000000001', playerName: 'Anne Bonny' },
  { playerId: 'a1b2c3d4-0000-4000-8000-000000000002', playerName: 'Calico Jack' },
  { playerId: 'a1b2c3d4-0000-4000-8000-000000000003', playerName: 'Mary Read' },
  { playerId: 'a1b2c3d4-0000-4000-8000-000000000004', playerName: 'Blackbeard' },
  { playerId: 'a1b2c3d4-0000-4000-8000-000000000005', playerName: 'Bartholomy Roberts' },
  { playerId: 'a1b2c3d4-0000-4000-8000-000000000006', playerName: "Grace O'Malley" },
  { playerId: 'a1b2c3d4-0000-4000-8000-000000000007', playerName: 'Henry Morgan' },
  { playerId: 'a1b2c3d4-0000-4000-8000-000000000008', playerName: 'Sam Bellamy' },
];
