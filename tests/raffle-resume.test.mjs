import assert from 'node:assert/strict';
import { test } from 'node:test';
import readXlsx from 'read-excel-file/node';
import { createRaffleWorkbook } from '../lib/raffle-export.ts';
import { parseRaffleReport } from '../lib/raffle-resume.ts';
import { encodeHistory, decodeHistory } from '../lib/raffle-history.ts';

const participants = [
  { id: 'confraternizacao:100', name: 'Ana Silva', sector: 'TI' },
  { id: 'confraternizacao:101', name: 'Ana Silva', sector: 'TI' },
  { id: 'confraternizacao:102', name: 'João Lima', sector: 'RH' },
];
const roster = { participants, ineligible: [{ id: 'confraternizacao:103', name: 'Pedro Souza', sector: 'Compras', paymentStatus: 'Aprovado', checkIn: 'Não', reason: 'Check-in não confirmado' }] };
const history = [{ id: 1, winners: [participants[0]], startRank: 1, timestamp: new Date('2026-11-13T12:00:00Z') }];

async function sheets() {
  return readXlsx(await (await createRaffleWorkbook(history, roster)).xlsx.writeBuffer());
}

test('exported Excel resumes the full roster and excludes winners by ID, even with identical names', async () => {
  const restored = parseRaffleReport(await sheets());
  assert.deepEqual(restored.roster, roster);
  assert.deepEqual(restored.history[0].winners, [participants[0]]);
  assert.equal(restored.history[0].timestamp.getTime(), history[0].timestamp.getTime());
  const drawn = new Set(restored.history.flatMap(result => result.winners.map(winner => winner.id)));
  const available = restored.roster.participants.filter(participant => !drawn.has(participant.id));
  assert.deepEqual(available, participants.slice(1));
  const continuedHistory = [...restored.history, { id: 2, winners: [available[0]], startRank: 2, timestamp: new Date('2026-11-13T12:10:00Z') }];
  const again = parseRaffleReport(await readXlsx(await (await createRaffleWorkbook(continuedHistory, restored.roster)).xlsx.writeBuffer()));
  assert.equal(again.history.length, 2);
  assert.equal(again.history[1].startRank, 2);
  assert.deepEqual(again.history.flatMap(result => result.winners.map(winner => winner.id)), participants.slice(0, 2).map(participant => participant.id));
});

test('supports previous reports without identifier columns using drawn status to match homonyms', async () => {
  const previous = await sheets();
  for (const sheet of previous) {
    const column = sheet.sheet === 'Ganhadores' ? 5 : sheet.sheet === 'Participantes' ? 4 : 6;
    for (const row of sheet.data) row.splice(column);
  }
  const restored = parseRaffleReport(previous);
  assert.equal(restored.history[0].winners[0].id, restored.roster.participants[0].id);
  assert.notEqual(restored.history[0].winners[0].id, restored.roster.participants[1].id);
});

test('rejects inconsistent statuses, missing results and unrelated spreadsheets before replacing a session', async () => {
  const changed = await sheets();
  changed.find(sheet => sheet.sheet === 'Participantes').data[4][3] = 'Não';
  assert.throws(() => parseRaffleReport(changed), /inválido/);
  const missing = await sheets();
  missing.find(sheet => sheet.sheet === 'Ganhadores').data.splice(4);
  assert.throws(() => parseRaffleReport(missing), /inválido/);
  assert.throws(() => parseRaffleReport([{ sheet: 'Planilha1', data: [['Nome'], ['Ana']] }]), /inválido/);
});

test('resuming an older report renews the 30-minute cache without changing historical timestamps', () => {
  const resumedAt = history[0].timestamp.getTime() + 24 * 60 * 60 * 1000;
  const cached = encodeHistory(history, roster, resumedAt);
  const restored = decodeHistory(cached, resumedAt + 5 * 60 * 1000);
  assert.deepEqual(restored.history, history);
  assert.equal(restored.activityAt, resumedAt);
  assert.equal(decodeHistory(cached, resumedAt + 30 * 60 * 1000), null);
});

test('resumes the final draw even when its single winner has already won a regular draw', async () => {
  const finalHistory = [...history, { id: 2, winners: [participants[0]], startRank: 2, timestamp: new Date('2026-11-13T12:10:00Z'), kind: 'final' }];
  const workbook = await createRaffleWorkbook(finalHistory, roster);
  assert.equal(workbook.getWorksheet('Ganhadores').getCell('G6').value, 'Sorteio final');
  const restored = parseRaffleReport(await readXlsx(await workbook.xlsx.writeBuffer()));
  assert.equal(restored.history.length, 2);
  assert.equal(restored.history[1].kind, 'final');
  assert.deepEqual(restored.history[1].winners, [participants[0]]);
  const now = finalHistory[1].timestamp.getTime();
  assert.equal(decodeHistory(encodeHistory(finalHistory, roster), now).history[1].kind, 'final');
});

test('a repeated winner is still rejected in a regular draw', async () => {
  const invalidHistory = [...history, { id: 2, winners: [participants[0]], startRank: 2, timestamp: new Date('2026-11-13T12:10:00Z') }];
  assert.throws(() => parseRaffleReport([]), /inválido/);
  const workbook = await createRaffleWorkbook(invalidHistory, roster);
  const sheets = await readXlsx(await workbook.xlsx.writeBuffer());
  assert.throws(() => parseRaffleReport(sheets), /inválido/);
});
