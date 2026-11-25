import { createHash, randomInt, randomUUID } from 'node:crypto';

function fail(status, message) { throw Object.assign(new Error(message), {status}); }
export const hash = value => createHash('sha256').update(value).digest('hex');
export function newRoom(owner, automatic) {
  return {id:randomUUID(), owner, automatic, phase:'quina', drawn:[], players:[], quinas:[], winners:[], turn:0};
}

// A assinatura usa conjuntos por coluna, inclusive se a ordem das casas mudar.
function deal(players) {
  const known = new Set(players.map(p=>p.signature));
  while (true) {
    const columns = Array.from({length:5},(_,c)=>{
      const pool=Array.from({length:15},(_,i)=>c*15+i+1);
      const numbers=Array.from({length:c===2?4:5},()=>pool.splice(randomInt(pool.length),1)[0]);
      if(c===2) numbers.splice(2,0,0);
      return numbers;
    });
    const signature=columns.map(col=>col.slice().sort((a,b)=>a-b).join(',')).join('|');
    if(!known.has(signature)) return {signature,card:columns[0].map((_,r)=>columns.map(col=>col[r]))};
  }
}

export function missing(card, drawn, phase) {
  const left = numbers => numbers.filter(n=>n && !drawn.has(n)).length;
  if(phase==='cheia') return left(card.flat());
  const lines=[...card,...card[0].map((_,c)=>card.map(row=>row[c])),
    card.map((row,i)=>row[i]),card.map((row,i)=>row[4-i])];
  return Math.min(...lines.map(left));
}
export function change(room, actor, data) {
  if(data.action==='join'){
    if(room.players.some(p=>p.key===actor)) return false;
    if(room.drawn.length || room.phase==='encerrada') fail(409,'Inscrições encerradas. O sorteio já começou.');
    const name=typeof data.name==='string'?data.name.trim():'';
    if(!name || name.length>60) fail(400,'Informe um nome de até 60 caracteres.');
    room.players.push({key:actor,name,...deal(room.players)});
    return true;
  }
  if(actor!==room.owner) fail(403,'Apenas o apresentador controla esta sala.');
  if(data.turn!==room.turn) fail(409,'O painel mudou. Confira a última pedra antes de continuar.');
  if(room.phase==='encerrada') fail(409,'Partida encerrada.');
  if(data.action==='phase'){
    if(room.phase!=='quina') fail(409,'A partida já está na cartela cheia.');
    room.phase='cheia';
  } else if(data.action==='rule'){
    room.automatic=data.automatic===true;
    if(room.phase==='quina' && room.automatic && room.quinas.length) room.phase='cheia';
  } else if(data.action==='draw'){
    if(!room.players.length) fail(409,'Aguarde a entrada de pelo menos um participante.');
    const drawn=new Set(room.drawn);
    const pool=Array.from({length:75},(_,i)=>i+1).filter(n=>!drawn.has(n));
    if(!pool.length) fail(409,'Todas as pedras já saíram. Avance para cartela cheia.');
    const ball=pool[randomInt(pool.length)];
    room.drawn.push(ball);drawn.add(ball);
    if(room.phase==='quina' && !room.quinas.length){
      room.quinas=room.players.filter(p=>!missing(p.card,drawn,'quina')).map(p=>p.name);
      if(room.quinas.length && room.automatic) room.phase='cheia';
    }
  } else fail(400,'Ação inválida.');
  if(room.phase==='cheia'){
    const drawn=new Set(room.drawn);
    room.winners=room.players.filter(p=>!missing(p.card,drawn,'cheia')).map(p=>p.name);
    if(room.winners.length) room.phase='encerrada';
  }
  room.turn++;
  return true;
}
export function view(room,actor) {
  const host=actor===room.owner, player=room.players.find(p=>p.key===actor);
  if(!host && !player) fail(403,'Entre na sala para acessar a cartela.');
  const drawn=new Set(room.drawn);
  const shared={id:room.id,phase:room.phase,drawn:room.drawn,automatic:room.automatic,
    quinas:room.quinas,winners:room.winners,turn:room.turn,count:room.players.length};
  return host ? {...shared, names:room.players.map(p=>p.name),
    near:room.players.filter(p=>room.phase!=='encerrada' && missing(p.card,drawn,room.phase)===1).map(p=>p.name)}
    : {...shared,name:player.name,card:player.card};
}
