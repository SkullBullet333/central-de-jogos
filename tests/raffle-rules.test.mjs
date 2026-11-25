import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDrawCandidates } from '../lib/raffle-rules.ts';

const participants = [{ id: '1', name: 'Ana Silva', sector: 'TI' }, { id: '2', name: 'Ana Silva', sector: 'RH' }];

test('regular draws exclude previous winners by identity', () => {
  assert.deepEqual(getDrawCandidates(participants, [participants[0]]), [participants[1]]);
});

test('the final draw reopens the full eligible roster even after all have won', () => {
  assert.deepEqual(getDrawCandidates(participants, participants), []);
  assert.deepEqual(getDrawCandidates(participants, participants, true), participants);
  assert.deepEqual(getDrawCandidates(participants, [participants[0]], true), participants);
});

test('enabling the final-only-undrawn option excludes all previous winners by identity', () => {
  assert.deepEqual(getDrawCandidates(participants, [participants[0]], true, true), [participants[1]]);
  assert.deepEqual(getDrawCandidates(participants, participants, true, true), []);
  assert.deepEqual(getDrawCandidates(participants, [], true, true), participants);
});

test('disabling the option restores all eligible participants and does not change regular draws', () => {
  assert.deepEqual(getDrawCandidates(participants, participants, true, false), participants);
  assert.deepEqual(getDrawCandidates(participants, [participants[0]], false, true), [participants[1]]);
});
