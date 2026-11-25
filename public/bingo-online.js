export function openRoom({guest,applyRoom,say}) {
  const byId=id=>document.getElementById(id);
  const prefix='bingo75:online:';
  const invite=new URLSearchParams(location.search).get('convite');
  let credential,id,snapshot,busy=false,reading=false,generation=0;
  function uuid(){
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
    return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  }
  try {
    id=guest?invite:localStorage.getItem(prefix+'host-room');
    const key=prefix+(guest?'player:'+invite:'host-key');
    credential=localStorage.getItem(key)||uuid();
    localStorage.setItem(key,credential);
  }catch{
    say('Permita o armazenamento neste navegador para recuperar sua sala ou cartela.');
    return;
  }
  async function request(action,fields){
    const response=await fetch('/api/bingo/',{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},
      body:JSON.stringify({action,id,turn:snapshot?.turn,...fields}),cache:'no-store'});
    const data=await response.json().catch(()=>({error:'Servidor de salas indisponível.'}));
    if(!response.ok || data.error) throw Object.assign(new Error(data.error || 'Falha na conexão.'),{status:response.status});
    return data;
  }
  function accept(data){
    id=data.id;snapshot=data;
    if(!guest)localStorage.setItem(prefix+'host-room',id);
    byId('room-form').hidden=true;byId('room-setup').hidden=true;
    byId('room-game').hidden=guest;
    applyRoom(data);
  }
  async function refresh(){
    if(reading || busy)return;
    reading=true;
    const version=generation;
    try{
      const data=await request('state');
      if(version===generation){accept(data);say('');}
    }catch(e){
      if(version!==generation)return;
      if(!snapshot && (e.status===403 || e.status===404)){
        if(!guest)byId('room-setup').hidden=false;
        else if(e.status===403)byId('room-form').hidden=false;
        if(e.status===403)return;
      }
      say(e.message);
    }finally{reading=false;}
  }
  async function run(action,fields={}){
    if(busy)return;
    busy=true;generation++;
    try{accept(await request(action,fields));say('');}
    catch(e){say(e.message);if(snapshot)applyRoom(snapshot);}
    finally{busy=false;}
  }
  byId('room-create').onclick=()=>run('create',{automatic:false});
  byId('room-form').onsubmit=e=>{e.preventDefault();run('join',{name:byId('room-name').value});};
  byId('room-advance').onclick=()=>{if(confirm('Passar para cartela cheia mantendo todas as pedras?'))run('phase');};
  byId('room-rule').onchange=e=>run('rule',{automatic:e.target.value==='auto'});
  if(id)refresh();else byId('room-setup').hidden=false;
  setInterval(()=>{if(id && !document.hidden && snapshot?.phase!=='encerrada' && byId('room-form').hidden)refresh();},4000);
  return {run,get busy(){return busy;}};
}
