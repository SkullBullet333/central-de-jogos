// A gravação condicional evita perder inscrições ou sortear duas vezes com painéis concorrentes.
const ttl=7*24*3600;
const cas="local old=redis.call('GET',KEYS[1]); if old==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1 end; return 0";
const url=process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token=process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const local=process.env.NODE_ENV==='development' && !url && !token && !process.env.VERCEL;
const memory=local ? (globalThis.__bingoRooms ??= new Map()) : null;
async function command(args){
  if(!url || !token) throw Object.assign(new Error('Conecte o Redis nas configurações da hospedagem.'),{status:503});
  const res=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args),cache:'no-store'});
  if(!res.ok) throw Error('Redis indisponível');
  const data=await res.json();
  if(data.error) throw Error('Falha na operação do Redis');
  return data.result;
}
export async function read(id){
  return local ? memory.get(id) ?? null : command(['GET','bingo:v1:'+id]);
}
export async function write(id,old,room){
  const next=JSON.stringify(room);
  if(local){
    if((memory.get(id)??null)!==old) return false;
    memory.set(id,next);return true;
  }
  const key='bingo:v1:'+id;
  return old===null ? (await command(['SET',key,next,'EX',ttl,'NX']))==='OK'
    : (await command(['EVAL',cas,1,key,old,next,ttl]))===1;
}
