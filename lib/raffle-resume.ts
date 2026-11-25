import type { Participant, RaffleResult, RaffleRoster } from './raffle-history';

interface Sheet { sheet: string; data: unknown[][] }
const text = (value: unknown) => value == null ? '' : String(value).trim();
const norm = (value: unknown) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const invalid = () => new Error('Relatório inválido ou incompleto. Importe o XLSX gerado pelo Sorteador.');

export function parseRaffleReport(sheets: Sheet[]): { roster: RaffleRoster; history: RaffleResult[] } {
  function getRows(name: string, headers: string[]) {
    const sheet = sheets.find(sheet => norm(sheet.sheet) === norm(name));
    if (!sheet || !text(sheet.data[0]?.[0]).startsWith('SORTEADOR') ||
        headers.some((header, i) => norm(sheet.data[3]?.[i]) !== norm(header))) throw invalid();
    return sheet.data.slice(4).filter(row => row.some(cell => text(cell)) && text(row[0]) !== 'Nenhum registro nesta aba.');
  }

  const participantRows = getRows('Participantes', ['Nº', 'Nome completo', 'Setor', 'Sorteado']);
  const winnerRows = getRows('Ganhadores', ['Ordem', 'Nome completo', 'Setor', 'Sorteio', 'Data e hora']);
  const excludedRows = getRows('Não aptos', ['Nº', 'Nome completo', 'Setor', 'Pagamento', 'Check-in', 'Motivo']);
  const participants: Participant[] = [];
  const drawnIds = new Set<string>();
  const allIds = new Set<string>();
  for (const [index, row] of participantRows.entries()) {
    const id = text(row[4]) || `relatorio:${index + 1}`;
    const name = text(row[1]);
    const status = norm(row[3]);
    if (!name || allIds.has(id) || !['sim', 'nao'].includes(status)) throw invalid();
    allIds.add(id);
    participants.push({ id, name, sector: text(row[2]) });
    if (status === 'sim') drawnIds.add(id);
  }
  if (!participants.length) throw invalid();

  const history: RaffleResult[] = [];
  const importedWinnerIds = new Set<string>();
  let previousRound = 0;
  for (const [index, row] of [...winnerRows].sort((a, b) => Number(a[0]) - Number(b[0])).entries()) {
    const finalDraw = norm(row[6]) === 'sorteio final';
    if (text(row[6]) && !['regular', 'sorteio final'].includes(norm(row[6]))) throw invalid();
    if (Number(row[0]) !== index + 1 || !Number.isInteger(Number(row[3])) || Number(row[3]) < 1) throw invalid();
    const participant = text(row[5])
      ? participants.find(participant => participant.id === text(row[5]))
      : participants.find(participant => participant.name === text(row[1]) && (participant.sector || '') === text(row[2]) && drawnIds.has(participant.id) && !importedWinnerIds.has(participant.id));
    if (!participant || participant.name !== text(row[1]) || !drawnIds.has(participant.id) || (!finalDraw && importedWinnerIds.has(participant.id))) throw invalid();
    importedWinnerIds.add(participant.id);
    const match = text(row[4]).match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) throw invalid();
    const [, day, month, year, hour, minute, second] = match;
    const timestamp = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-04:00`);
    if (!Number.isFinite(timestamp.getTime())) throw invalid();
    const round = Number(row[3]);
    if (round !== previousRound) {
      if (round !== previousRound + 1) throw invalid();
      history.push({ id: timestamp.getTime() + round, startRank: index + 1, winners: [], timestamp, ...(finalDraw ? { kind: 'final' as const } : {}) });
      previousRound = round;
    }
    const result = history[history.length - 1];
    if ((result.kind === 'final') !== finalDraw || (finalDraw && result.winners.length)) throw invalid();
    result.winners.push(participant);
  }
  // A missing winner must never turn into a new chance to be drawn.
  if (drawnIds.size !== importedWinnerIds.size) throw invalid();
  const ineligible = excludedRows.map((row, index) => {
    const id = text(row[6]) || `relatorio:excluido:${index + 1}`;
    if (!text(row[1]) || allIds.has(id)) throw invalid();
    allIds.add(id);
    return { id, name: text(row[1]), sector: text(row[2]), paymentStatus: text(row[3]), checkIn: text(row[4]), reason: text(row[5]) };
  });
  return { roster: { participants, ineligible }, history };
}

