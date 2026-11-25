import type { Participant, IneligibleParticipant, RaffleRoster } from './raffle-history';

const text = (value: unknown) => value == null ? '' : String(value).trim().replace(/\s+/g, ' ');
const normalize = (value: unknown) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function parseConfraternizationRows(rows: unknown[][]): Participant[] {
  return parseConfraternizationImport(rows).participants;
}

export function parseConfraternizationImport(rows: unknown[][]): RaffleRoster {
  const header = rows[7];
  if (!header || normalize(header[2]) !== 'nome' || normalize(header[3]) !== 'sobrenome' ||
      normalize(header[10]) !== 'estado de pagamento' || normalize(header[11]) !== 'check-in' ||
      !normalize(header[26]).includes('setor')) {
    throw new Error('Formato inválido. Confira o cabeçalho na linha 8 e as colunas C, D, K, L e AA.');
  }

  const participants: Participant[] = [];
  const ineligible: IneligibleParticipant[] = [];
  const seenIds = new Set<string>();
  for (let index = 8; index < rows.length; index++) {
    const row = rows[index];
    const name = [text(row[2]), text(row[3])].filter(Boolean).join(' ');
    if (!name) continue;
    // Ticket numbers distinguish people with the same name and survive reimports.
    const id = `confraternizacao:${text(row[1]) || `linha-${index + 1}`}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const participant = { id, name, sector: text(row[26]) };
    const approved = normalize(row[10]) === 'aprovado';
    const checkedIn = normalize(row[11]) === 'sim';
    if (approved && checkedIn) {
      participants.push(participant);
    } else {
      ineligible.push({
        ...participant,
        paymentStatus: text(row[10]),
        checkIn: text(row[11]),
        reason: [!approved ? 'Pagamento não aprovado' : '', !checkedIn ? 'Check-in não confirmado' : ''].filter(Boolean).join('; '),
      });
    }
  }
  return { participants, ineligible };
}
