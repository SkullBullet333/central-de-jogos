import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HISTORY_CACHE_TTL, decodeHistory, encodeHistory, getBackupWindow } from '../lib/raffle-history.ts';

const now = Date.parse('2026-11-12T12:00:00Z');
const history = [
  { id: 1, winners: [{ id: 'João', name: 'João' }, { id: 'Maria', name: 'Maria' }], startRank: 1, timestamp: new Date(now) },
  { id: 2, winners: [{ id: 'Ana', name: 'Ana' }], startRank: 3, timestamp: new Date(now + 60000) },
];

test('restores results, dates and ranking from the automatic backup', () => {
  const cached = encodeHistory(history);
  const restored = decodeHistory(cached, now + 5 * 60000);
  assert.deepEqual(restored, { history });
  assert.deepEqual(restored.history.flatMap(result => result.winners.map(winner => winner.name)), ['João', 'Maria', 'Ana']);
  assert.equal(restored.history[0].timestamp.toLocaleTimeString('pt-BR', { timeZone: 'UTC' }), '12:00:00');
});

test('expires 30 minutes after the last draw, without extending on reload', () => {
  const cached = encodeHistory(history);
  const expiresAt = now + 60000 + HISTORY_CACHE_TTL;
  assert.ok(decodeHistory(cached, expiresAt - 1));
  assert.equal(decodeHistory(cached, expiresAt), null);
  assert.equal(decodeHistory(cached, expiresAt + 1), null);
});

test('ignores corrupted, incompatible or invalid stored history', () => {
  const valid = JSON.parse(encodeHistory(history));
  for (const value of ['invalid JSON', 'null', '{}', JSON.stringify({ ...valid, version: 5 }),
    JSON.stringify({ ...valid, history: [] }),
    JSON.stringify({ ...valid, history: [{ ...valid.history[0], timestamp: 'invalid' }] }),
    JSON.stringify({ ...valid, history: [{ ...valid.history[0], startRank: 5 }] }),
    JSON.stringify({ ...valid, history: [{ ...valid.history[0], winners: [null] }] })]) {
    assert.equal(decodeHistory(value, now), null);
  }
});

test('preserves sectors and distinct participants with the same name in cache', () => {
  const winners = [{ id: 'evento:1', name: 'Ana Silva', sector: 'TI' }, { id: 'evento:2', name: 'Ana Silva', sector: 'RH' }];
  const results = [{ ...history[0], winners }];
  assert.deepEqual(decodeHistory(encodeHistory(results), now).history, results);
});

test('restores the previous cache format without losing old results', () => {
  const cached = JSON.parse(encodeHistory(history));
  cached.version = 1;
  cached.history = cached.history.map(result => ({ ...result, winners: result.winners.map(winner => winner.name) }));
  assert.deepEqual(decodeHistory(JSON.stringify(cached), now).history, history);
});

test('each completed draw updates the backup and renews its expiry', () => {
  const firstDraw = [history[0]];
  const oldBackup = encodeHistory(firstDraw);
  const nextDrawTime = now + 19 * 60000;
  const updatedHistory = [...firstDraw, { ...history[1], timestamp: new Date(nextDrawTime) }];
  const updatedBackup = encodeHistory(updatedHistory);
  assert.equal(decodeHistory(oldBackup, now + 31 * 60000), null);
  assert.deepEqual(decodeHistory(updatedBackup, now + 31 * 60000).history, updatedHistory);
  assert.equal(decodeHistory(updatedBackup, nextDrawTime + HISTORY_CACHE_TTL), null);
});

test('restores the legacy backup without preserving its old automatic-download schedule', () => {
  const cached = JSON.parse(encodeHistory(history));
  cached.version = 3;
  cached.nextDownloadAt = now - 1;
  const restored = decodeHistory(JSON.stringify(cached), now);
  assert.deepEqual(restored.history, history);
  assert.equal('nextDownloadAt' in restored, false);
  assert.equal('nextDownloadAt' in JSON.parse(encodeHistory(restored.history)), false);
});

test('warns at 27 minutes, expires at 30, and recalculates correctly after reload', () => {
  assert.equal(getBackupWindow(now, now + 27 * 60000 - 1).status, null);
  assert.equal(getBackupWindow(now, now + 27 * 60000).status, 'warning');
  assert.equal(getBackupWindow(now, now + 29 * 60000).status, 'warning');
  assert.equal(getBackupWindow(now, now + 30 * 60000).status, 'expired');
  assert.equal(getBackupWindow(now, now + 35 * 60000).status, 'expired');
  const newDrawAt = now + 28 * 60000;
  assert.equal(getBackupWindow(newDrawAt, newDrawAt).status, null);
  assert.equal(getBackupWindow(newDrawAt, newDrawAt + 27 * 60000).status, 'warning');
});
