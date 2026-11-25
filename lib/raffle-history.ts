export const HISTORY_CACHE_KEY = 'sorteador-unimed:history:v1';
export const HISTORY_CACHE_TTL = 30 * 60 * 1000;
export const HISTORY_CACHE_WARNING = 27 * 60 * 1000;

export function getBackupWindow(lastActivityAt: number, now = Date.now()) {
  const warningAt = lastActivityAt + HISTORY_CACHE_WARNING;
  const expiresAt = lastActivityAt + HISTORY_CACHE_TTL;
  const status: 'warning' | 'expired' | null = now >= expiresAt ? 'expired' : now >= warningAt ? 'warning' : null;
  return { warningAt, expiresAt, status };
}

export interface Participant {
  id: string;
  name: string;
  sector?: string;
}

export interface RaffleResult {
  id: number;
  winners: Participant[];
  startRank: number;
  timestamp: Date;
  kind?: 'regular' | 'final';
}

export interface IneligibleParticipant extends Participant {
  paymentStatus: string;
  checkIn: string;
  reason: string;
}

export interface RaffleRoster {
  participants: Participant[];
  ineligible: IneligibleParticipant[];
}

function isParticipant(value: unknown): value is Participant {
  if (!value || typeof value !== 'object') return false;
  const participant = value as Participant;
  return typeof participant.id === 'string' && !!participant.id.trim() &&
    typeof participant.name === 'string' && !!participant.name.trim() &&
    (participant.sector === undefined || typeof participant.sector === 'string');
}

export function encodeHistory(history: RaffleResult[], roster?: RaffleRoster, activityAt?: number) {
  return JSON.stringify({
    version: 4,
    expiresAt: Math.max(history[history.length - 1].timestamp.getTime(), activityAt ?? 0) + HISTORY_CACHE_TTL,
    history,
    ...(roster ? { roster } : {}),
    ...(activityAt ? { activityAt } : {}),
  });
}

export function decodeHistory(value: string, now = Date.now()): {
  history: RaffleResult[];
  roster?: RaffleRoster;
  activityAt?: number;
} | null {
  try {
    const cached = JSON.parse(value);
    if (![1, 2, 3, 4].includes(cached.version) || !Number.isFinite(cached.expiresAt) || cached.expiresAt <= now ||
        !Array.isArray(cached.history) || !cached.history.length) return null;

    const history: RaffleResult[] = [];
    let nextRank = 1;
    for (const result of cached.history) {
      if (!result || !Number.isFinite(result.id) || result.startRank !== nextRank ||
          !Array.isArray(result.winners) || !result.winners.length ||
          typeof result.timestamp !== 'string') return null;
      const winners: Participant[] = [];
      for (const winner of result.winners) {
        if (cached.version === 1) {
          if (typeof winner !== 'string' || !winner.trim()) return null;
          winners.push({ id: winner, name: winner });
        } else {
          if (!isParticipant(winner)) return null;
          winners.push({ id: winner.id, name: winner.name, ...(winner.sector !== undefined ? { sector: winner.sector } : {}) });
        }
      }
      const timestamp = new Date(result.timestamp);
      if (!Number.isFinite(timestamp.getTime())) return null;
      if (result.kind !== undefined && !['regular', 'final'].includes(result.kind)) return null;
      if (result.kind === 'final' && winners.length !== 1) return null;
      history.push({ id: result.id, winners, startRank: result.startRank, timestamp, ...(result.kind ? { kind: result.kind } : {}) });
      nextRank += result.winners.length;
    }
    if (cached.roster !== undefined) {
      const roster = cached.roster;
      if (!roster || !Array.isArray(roster.participants) || !roster.participants.every(isParticipant) ||
          !Array.isArray(roster.ineligible) || !roster.ineligible.every((entry: IneligibleParticipant) =>
            isParticipant(entry) && typeof entry.paymentStatus === 'string' && typeof entry.checkIn === 'string' && typeof entry.reason === 'string')) return null;
    }
    if (cached.activityAt !== undefined && !Number.isFinite(cached.activityAt)) return null;
    return { history, ...(cached.roster ? { roster: cached.roster } : {}), ...(cached.activityAt ? { activityAt: cached.activityAt } : {}) };
  } catch {
    return null;
  }
}

