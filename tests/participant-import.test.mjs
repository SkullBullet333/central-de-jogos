import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseConfraternizationRows, parseConfraternizationImport } from '../lib/participant-import.ts';

function row(ticket, name, surname, status, checkIn, sector) {
  const values = [];
  values[1] = ticket;
  values[2] = name;
  values[3] = surname;
  values[10] = status;
  values[11] = checkIn;
  values[26] = sector;
  return values;
}

function workbook(...data) {
  const rows = Array.from({ length: 7 }, () => []);
  rows.push(row('Nº ingresso', 'Nome', 'Sobrenome', 'Estado de pagamento', 'Check-in', 'Setor do Colaborador (do dependente deve ser o mesmo)'));
  return [...rows, ...data];
}

test('uses row 8 as header and requires BOTH approval and check-in', () => {
  const rows = workbook(
    row('1', 'Ana', 'Silva', 'Aprovado', 'Sim', 'TI'),
    row('2', 'Bruno', 'Souza', 'Aprovado', 'Não', 'RH'),
    row('3', 'Carla', 'Lima', 'Cancelado', 'Sim', 'Financeiro'),
    row('4', 'Davi', 'Costa', null, 'Sim', 'Compras'),
    row('5', 'Eva', 'Alves', 'Aprovado', null, 'Auditoria'),
    [],
  );
  rows[0] = row('fake', 'Não', 'Importar', 'Aprovado', 'Sim', 'Falso');
  assert.deepEqual(parseConfraternizationRows(rows), [{ id: 'confraternizacao:1', name: 'Ana Silva', sector: 'TI' }]);
});

test('handles whitespace/case, empty sectors and homonyms without splitting names on commas', () => {
  const participants = parseConfraternizationRows(workbook(
    row('1', '  Ana ', ' Silva, Souza  ', ' APROVADO ', ' sim ', '  Tecnologia   da Informação '),
    row('2', 'Ana', 'Silva, Souza', 'Aprovado', 'Sim', null),
    row('3', '', '', 'Aprovado', 'Sim', 'TI'),
  ));
  assert.deepEqual(participants, [
    { id: 'confraternizacao:1', name: 'Ana Silva, Souza', sector: 'Tecnologia da Informação' },
    { id: 'confraternizacao:2', name: 'Ana Silva, Souza', sector: '' },
  ]);
});

test('does not give the same ticket another chance when duplicated or reimported', () => {
  const original = row('1', 'Ana', 'Silva', 'Aprovado', 'Sim', 'TI');
  const participants = parseConfraternizationRows(workbook(original, original));
  assert.equal(participants.length, 1);
  assert.equal(parseConfraternizationRows(workbook([], original))[0].id, participants[0].id);
});

test('returns no participants if nobody meets the rule and rejects the wrong template', () => {
  assert.deepEqual(parseConfraternizationRows(workbook(row('1', 'Ana', 'Silva', 'Aprovado', 'Não', 'TI'))), []);
  assert.throws(() => parseConfraternizationRows([['Nome'], ['Ana']]), /linha 8/);
  const rows = workbook();
  rows[7][10] = 'Outro campo';
  assert.throws(() => parseConfraternizationRows(rows), /colunas/);
});

test('retains ineligible participants with the payment, check-in and exclusion reasons', () => {
  const imported = parseConfraternizationImport(workbook(
    row('1', 'Ana', 'Silva', 'Aprovado', 'Sim', 'TI'),
    row('2', 'Bruno', 'Costa', 'Aprovado', 'Não', 'Compras'),
    row('3', 'Carla', 'Lima', 'Cancelado', 'Não', 'RH'),
    [],
  ));
  assert.equal(imported.participants.length, 1);
  assert.equal(imported.ineligible.length, 2);
  assert.equal(imported.ineligible[0].reason, 'Check-in não confirmado');
  assert.equal(imported.ineligible[0].name, 'Bruno Costa');
  assert.equal(imported.ineligible[1].paymentStatus, 'Cancelado');
  assert.equal(imported.ineligible[1].reason, 'Pagamento não aprovado; Check-in não confirmado');
});
