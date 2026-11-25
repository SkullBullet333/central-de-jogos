import { change, hash, newRoom, view } from '@/lib/bingo-room.mjs';
import { read, write } from '@/lib/bingo-store.mjs';

export const runtime='nodejs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function reply(body:unknown,status=200){
  return Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
  try{
    const credential=request.headers.get('authorization')?.replace(/^Bearer /,'') ?? '';
    if(!uuid.test(credential)) return reply({error:'Credencial inválida.'},401);
    const actor=hash(credential);
    const data=await request.json().catch(()=>null);
    if(!data || typeof data!=='object') return reply({error:'Pedido inválido.'},400);
    if(data.action==='create'){
      const room=newRoom(actor,data.automatic===true);
      if(await write(room.id,null,room)) return reply(view(room,actor),201);
      return reply({error:'Tente criar a sala novamente.'},409);
    }
    if(!uuid.test(data.id)) return reply({error:'Convite inválido.'},400);
    for(let attempt=0;attempt<16;attempt++){
      const old=await read(data.id);
      if(!old) return reply({error:'Sala inexistente ou expirada.'},404);
      const room=JSON.parse(old);
      if(data.action==='state' || !change(room,actor,data)) return reply(view(room,actor));
      if(await write(data.id,old,room)) return reply(view(room,actor));
    }
    return reply({error:'Muitas entradas simultâneas. Tente novamente.'},409);
  }catch(error){
    const e=error as Error & {status?:number};
    return reply({error:e.status?e.message:'Serviço temporariamente indisponível. Tente novamente.'},e.status || 503);
  }
}
