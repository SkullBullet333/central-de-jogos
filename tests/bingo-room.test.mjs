import test from 'node:test';
import assert from 'node:assert/strict';
import {change,missing,newRoom,view} from '../lib/bingo-room.mjs';

test('participantes recebem cartelas distintas e recuperam a mesma ao repetir a inscrição',()=>{
  const r=newRoom('host',false);
  for(let i=0;i<150;i++)change(r,'j'+i,{action:'join',name:'Jogador '+i});
  assert.equal(new Set(r.players.map(p=>p.signature)).size,150);
  assert.equal(change(r,'j0',{action:'join',name:'Outro nome'}),false);
  const p=view(r,'j0');assert.equal(p.card[2][2],0);assert.equal(p.name,'Jogador 0');
  assert(!('names' in p));assert(!('owner' in p));assert(!('players' in p));
  assert.throws(()=>change(r,'j0',{action:'draw',turn:0}),/apresentador/);
  change(r,'host',{action:'draw',turn:0});
  assert.throws(()=>change(r,'host',{action:'draw',turn:0}),/mudou/);
  assert.throws(()=>change(r,'late',{action:'join',name:'Novo'}),/encerradas/);
  assert.equal(change(r,'j0',{action:'join',name:'Jogador'}),false);
});
test('quinas simultâneas, fase manual e cheia com a cartela original',()=>{
  const r=newRoom('host',false),card=Array.from({length:5},(_,i)=>[1,16,31,46,61].map(x=>x+i));
  card[2][2]=0;r.players=['Ana','Rui'].map(name=>({key:name,name,card}));
  r.drawn=card[0].slice(1);assert.deepEqual(view(r,'host').near,['Ana','Rui']);
  r.drawn=Array.from({length:75},(_,i)=>i+1).filter(n=>n!==1);
  change(r,'host',{action:'draw',turn:r.turn});
  assert.equal(r.phase,'quina');assert.deepEqual(r.quinas,['Ana','Rui']);
  change(r,'host',{action:'phase',turn:r.turn});assert.equal(r.phase,'encerrada');
  assert.deepEqual(r.winners,['Ana','Rui']);
});
test('troca automática preserva pedras e anuncia falta de uma para cheia',()=>{
  const r=newRoom('host',true);change(r,'ana',{action:'join',name:'Ana'});
  const card=r.players[0].card, last=card[0][0];
  while(r.phase==='quina')change(r,'host',{action:'draw',turn:r.turn});
  assert.deepEqual(r.quinas,['Ana']);
  r.phase='cheia';r.drawn=card.flat().filter(n=>n && n!==last);
  assert.equal(missing(card,new Set(r.drawn),'cheia'),1);
  assert.deepEqual(view(r,'host').near,['Ana']);
});
