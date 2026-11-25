import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const html = readFileSync(new URL('../public/bingo.html', import.meta.url),'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(source);

// O HTML é autocontido. Executa as rotinas da página sem montar a interface.
function game(storage = new Map(), search = '') {
  function section(start, end) {
    const a = source.indexOf(start), b = source.indexOf(end,a);
    assert(a >= 0 && b > a);
    return source.slice(a,b);
  }
  return vm.runInNewContext([
    section('const STORAGE_KEY','/* ==================== WEB AUDIO'),
    section('const indices =','/* ==================== RENDERERS'),
    section('function pickBall','function drawNextBall'),
    '({pickBall, createFreshState, evaluateCardWins, verifyClaim, loadState, saveState, lines, numberedCells, isValidStateShape, get saved(){return storageAvailable}, get resume(){return restoredMode}})'
  ].join('\n'),{
    URLSearchParams, window:{location:{search}},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}
  });
}

test('75 bolas distintas e nenhum 76º número',()=>{
  const g=game(), drawn=[];
  for(let i=0;i<75;i++) drawn.push(g.pickBall(drawn));
  assert.deepEqual(drawn.sort((a,b)=>a-b), Array.from({length:75},(_,i)=>i+1));
  assert.equal(g.pickBall(drawn),null);
});
test('retoma partida antiga mesmo após o vencimento original',()=>{
  const store=new Map(), g=game(store), state=g.createFreshState('presenter');
  state.expiresAt=1; state.presenter.drawn=[12,22];state.player.marked[0][0]=true;
  g.saveState(state);
  const reopened=game(store), restored=reopened.loadState();
  assert.equal(reopened.resume,'presenter');assert.deepEqual([...restored.presenter.drawn],[12,22]);
  assert.equal(restored.player.marked[0][0],true);
});
test('cartela, histórico e armazenamento inválidos permitem recomeçar',()=>{
  const g=game(), state=g.createFreshState();
  assert(g.isValidStateShape(state));state.player.card[0][0]=75;assert(!g.isValidStateShape(state));
  const other=g.createFreshState();other.presenter.drawn=[1,1];assert(!g.isValidStateShape(other));
  const denied=game({get(){throw Error()},set(){throw Error()}});
  assert(denied.isValidStateShape(denied.loadState())); assert.equal(denied.saved,false);
});
test('confere as 12 combinações, centro livre e diferenças do histórico',()=>{
  const g=game(), {card}=g.createFreshState().player;
  for(const line of g.lines){
    const marks=card.map(row=>row.map(()=>false));marks[2][2]=true;
    for(const [r,c] of line.cells)marks[r][c]=true;
    assert.deepEqual([...g.evaluateCardWins(marks).patterns],[line.label]);
    const numbers=g.numberedCells(line).map(([r,c])=>card[r][c]);
    const claim=line.code+' '+numbers.join(' ');
    assert.match(g.verifyClaim(claim,numbers),/confirmada/);
    assert.equal(g.verifyClaim(claim,numbers.slice(1)),'Ainda não sorteados: '+numbers[0]);
    assert.doesNotMatch(g.verifyClaim(claim+' 0',numbers),/confirmada/);
  }
});
test('link de uma nova sala abre cartela no modo jogador',()=>{
  const state=game(new Map(),'?modo=jogador&sala=B75-1234').loadState();
  assert.equal(state.mode,'player');assert.equal(state.roomCode,'B75-1234');
});
