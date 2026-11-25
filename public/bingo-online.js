export function openRoom(renderQR) {
  const params=new URLSearchParams(location.search);
  const invite=params.get('convite');
  const host=invite===null;
  const root=document.getElementById('online');
  root.hidden=false;
  const byId=id=>document.getElementById(id);
  const show=(id,visible)=>{byId(id).hidden=!visible;};
  const say=text=>{byId('room-status').textContent=text;};
  const prefix='bingo75:online:';
  let credential,id,snapshot,busy=false,joined=false,qrId='';
  function uuid(){
    // Também funciona por HTTP na rede local durante os testes com celular.
    const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
    const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
    return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
  }
  try {
    id=host?localStorage.getItem(prefix+'host-room'):invite;
    const key=prefix+(host?'host-key':'player:'+invite);
    credential=localStorage.getItem(key)||uuid();localStorage.setItem(key,credential);
  } catch {
    say('Permita o armazenamento neste navegador para recuperar sua sala ou cartela.');return;
  }
  async function request(action,fields={}){
    const response=await fetch('/api/bingo/',{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},
      body:JSON.stringify({action,id,turn:snapshot?.turn,...fields}),cache:'no-store'});
    const data=await response.json().catch(()=>({error:'O serviço de salas precisa de um servidor Next.js.'}));
    if(!response.ok||data.error)throw Object.assign(new Error(data.error||'Falha na conexão.'),{status:response.status});
    return data;
  }
  const label=n=>'BINGO'[Math.floor((n-1)/15)]+' '+n;
  function render(data){
    snapshot=data;joined=true;id=data.id;
    show('room-setup',false);show('room-join',false);show('room-game',true);
    show('room-controls',host);show('room-player',!host);
    byId('room-title').textContent=host?'Painel do apresentador':data.name;
    byId('room-phase').textContent=({quina:'Quina',cheia:'Cartela cheia',encerrada:'Partida encerrada'})[data.phase];
    byId('room-count').textContent=data.count+' participante(s) · '+data.drawn.length+' / 75 pedras';
    byId('room-ball').textContent=data.drawn.length?label(data.drawn.at(-1)):'—';
    byId('room-history').textContent=data.drawn.slice(-5).reverse().map(label).join(' · ');
    byId('room-awards').textContent=[data.quinas.length?'Primeira quina: '+data.quinas.join(', '):'',
      data.winners.length?'Cartela cheia: '+data.winners.join(', '):''].filter(Boolean).join(' · ');
    if(host){
      const link=new URL('/bingo.html',location.origin);link.searchParams.set('convite',id);
      byId('room-link').href=link.href;byId('room-link').textContent=link.href;
      if(qrId!==id){renderQR(link.href,byId('room-qr'));qrId=id;}
      byId('room-near').textContent=data.near.join(', ')||'Ninguém por enquanto.';
      byId('room-names').textContent=data.names.join(', ')||'Aguardando participantes.';
      byId('room-rule').value=data.automatic?'auto':'manual';
      byId('room-draw').disabled=busy||!data.count||data.phase==='encerrada'||data.drawn.length===75;
      show('room-advance',data.phase==='quina');show('room-rule-label',data.phase==='quina');
    }else{
      const card=byId('room-card');card.replaceChildren();
      for(const l of 'BINGO'){const h=document.createElement('strong');h.textContent=l;card.append(h);}
      for(const n of data.card.flat()){
        const cell=document.createElement('span');cell.textContent=n||'Livre';
        if(!n||data.drawn.includes(n)){cell.className='hit';cell.setAttribute('aria-label',(n||'Livre')+', marcado');}
        card.append(cell);
      }
    }
  }
  async function run(action,fields={}){
    if(busy)return;
    busy=true;
    try{
      const data=await request(action,fields);
      if(host)localStorage.setItem(prefix+'host-room',data.id);
      busy=false;render(data);say('');
    }catch(e){
      if(action==='state' && !joined && (e.status===403||e.status===404)){
        if(host)show('room-setup',true);else if(e.status===403)show('room-join',true);
        say(e.status===404?'Esta sala expirou ou não existe.':'');
      }else{
        say(e.message);
        if(joined && e.status===409)try{render(await request('state'));}catch{}
      }
    }finally{busy=false;if(snapshot && host)byId('room-draw').disabled=!snapshot.count||snapshot.phase==='encerrada'||snapshot.drawn.length===75;}
  }
  byId('room-create').onclick=()=>run('create',{automatic:byId('setup-rule').value==='auto'});
  byId('room-form').onsubmit=e=>{e.preventDefault();run('join',{name:byId('room-name').value});};
  byId('room-draw').onclick=()=>run('draw');
  byId('room-advance').onclick=()=>{if(confirm('Passar para cartela cheia mantendo todas as pedras?'))run('phase');};
  byId('room-rule').onchange=e=>run('rule',{automatic:e.target.value==='auto'});
  byId('room-new').onclick=()=>{if(confirm('Criar outra sala com um novo convite? A sala atual ficará separada.'))run('create',{automatic:snapshot.automatic});};
  byId('room-copy').onclick=async()=>{
    try{await navigator.clipboard.writeText(byId('room-link').href);say('Convite copiado.');}
    catch{say('Selecione e copie o endereço exibido abaixo do QR Code.');}
  };
  if(id)run('state');else show('room-setup',true);
  setInterval(()=>{if(joined && !document.hidden && !busy && snapshot.phase!=='encerrada')run('state');},4000);
}
