import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { createRaffleWorkbook, downloadRaffleXLSX } from '../lib/raffle-export.ts';
import { encodeHistory, decodeHistory } from '../lib/raffle-history.ts';

const ana = { id: '1', name: 'Ana Silva', sector: 'TI' };
const homonym = { id: '2', name: 'Ana Silva', sector: 'RH' };
const literal = { id: '3', name: '=2+2', sector: 'Financeiro' };
const excluded = { id: '4', name: 'Bruno Costa', sector: 'Compras', paymentStatus: 'Aprovado', checkIn: 'Não', reason: 'Check-in não confirmado' };
const roster = { participants: [ana, homonym, literal], ineligible: [excluded] };
const history = [{ id: 1, winners: [ana], startRank: 1, timestamp: new Date('2026-11-13T12:00:00Z') }];

test('XLSX preserves all three sheets, status by ID, exclusions, formatting and literal names', async () => {
  const created = await createRaffleWorkbook(history, roster);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await created.xlsx.writeBuffer());
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Ganhadores', 'Participantes', 'Não aptos']);
  const winners = workbook.getWorksheet('Ganhadores');
  assert.equal(winners.getCell('B5').value, 'Ana Silva');
  assert.equal(winners.getCell('E5').value, '13/11/2026, 08:00:00');
  const participants = workbook.getWorksheet('Participantes');
  assert.equal(participants.getCell('D5').value, 'Sim');
  assert.equal(participants.getCell('D6').value, 'Não');
  assert.equal(participants.getCell('B7').value, '=2+2');
  assert.equal(participants.rowCount, 7);
  assert.equal(participants.getCell('B4').font.bold, true);
  assert.equal(participants.getCell('B4').fill.fgColor.argb, 'FF00995D');
  assert.ok(participants.getColumn(2).width >= 40);
  assert.equal(participants.views[0].ySplit, 4);
  assert.ok(participants.autoFilter);
  assert.equal(participants.getCell('B5').alignment.wrapText, true);
  const rejected = workbook.getWorksheet('Não aptos');
  assert.equal(rejected.getCell('B5').value, excluded.name);
  assert.equal(rejected.getCell('D5').value, 'Aprovado');
  assert.equal(rejected.getCell('E5').value, 'Não');
  assert.equal(rejected.getCell('F5').value, excluded.reason);
});

test('roster and exclusions survive reload with the history', () => {
  const now = history[0].timestamp.getTime();
  const restored = decodeHistory(encodeHistory(history, roster), now);
  assert.deepEqual(restored.roster, roster);
  const invalid = JSON.parse(encodeHistory(history, roster));
  invalid.roster.ineligible[0].reason = null;
  assert.equal(decodeHistory(JSON.stringify(invalid), now), null);
});

test('empty tabs remain readable and previous winners remain on the participants tab', async () => {
  const workbook = await createRaffleWorkbook(history, { participants: [], ineligible: [] });
  assert.equal(workbook.getWorksheet('Participantes').getCell('B5').value, ana.name);
  assert.equal(workbook.getWorksheet('Não aptos').getCell('A5').value, 'Nenhum registro nesta aba.');
});

test('download uses XLSX MIME type and filename, releases URL, and respects cancellation', async t => {
  let blob;
  let clicked = 0;
  let revoked = false;
  const link = { click: () => { clicked++; }, remove: () => {} };
  t.mock.method(URL, 'createObjectURL', value => { blob = value; return 'blob:test'; });
  t.mock.method(URL, 'revokeObjectURL', () => { revoked = true; });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => link, body: { appendChild: () => {} } } });
  t.after(() => { delete globalThis.document; });
  await downloadRaffleXLSX(history, roster);
  assert.equal(clicked, 1);
  assert.match(link.download, /\.xlsx$/);
  assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.deepEqual(Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, 2)), [80, 75]);
  const controller = new AbortController();
  controller.abort();
  await downloadRaffleXLSX(history, roster, controller.signal);
  assert.equal(clicked, 1);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.ok(revoked);
});
