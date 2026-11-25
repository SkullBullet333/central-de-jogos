import type { Participant } from './raffle-history';

export function getDrawCandidates(participants: Participant[], drawn: Participant[], finalDraw = false, finalOnlyUndrawn = false) {
  if (finalDraw && !finalOnlyUndrawn) return participants;
  const drawnIds = new Set(drawn.map(participant => participant.id));
  return participants.filter(participant => !drawnIds.has(participant.id));
}
