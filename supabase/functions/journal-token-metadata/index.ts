import { createClient } from "npm:@supabase/supabase-js@2";
const U=Deno.env.get("SUPABASE_URL")!,K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(U,K,{auth:{persistSession:false}});
const RPC:any={robinhood:"https://robinhood-rpc.publicnode.com",arc:"https://arc-rpc.publicnode.com",bsc:"https://bsc-rpc.publicnode.com"};
function out(x:any,s=200){return new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json"}})}
async function rpc(url:string,m:string,p:any[]){const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:p})});if(!r.ok)throw new Error(`${m} HTTP ${r.status}`);const j=await r.json();if(j?.error)throw new Error(j.error.message||String(j.error.code));return j.result}
function decodeString(v:string|null){if(!v||v==="0x")return null;try{const r=v.slice(2);let z="";if(r.length===64)z=r;else if(r.length>=128){const n=parseInt(r.slice(64,128),16);if(!n||n>128)return null;z=r.slice(128,128+n*2)}else return null;const b=new Uint8Array((z.match(/.{2}/g)||[]).map(x=>parseInt(x,16)));const s=new TextDecoder().decode(b).replace(/\0+$/g,"").trim();return s||null}catch{return null}}
async function dex(token:string){try{const r=await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`,{headers:{"accept":"application/json","user-agent":"trading-journal/1.0"}});if(!r.ok)return null;const j=await r.json();for(const p of j?.pairs||[]){const base=String(p?.baseToken?.address||"").toLowerCase(),quote=String(p?.quoteToken?.address||"").toLowerCase(),t=token.toLowerCase();if(base===t&&p?.baseToken?.symbol)return{symbol:String(p.baseToken.symbol),name:String(p.baseToken.name||"")||null};if(quote===t&&p?.quoteToken?.symbol)return{symbol:String(p.quoteToken.symbol),name:String(p.quoteToken.name||"")||null}}}catch{}return null}
async function pump(token:string){try{const r=await fetch(`https://frontend-api-v3.pump.fun/coins/${token}`,{headers:{"accept":"application/json","user-agent":"trading-journal/1.0"}});if(!r.ok)return null;const j=await r.json();if(j?.symbol)return{symbol:String(j.symbol),name:j?.name?String(j.name):null}}catch{}return null}
async function jupiter(token:string){for(const url of [`https://tokens.jup.ag/token/${token}`,`https://api.jup.ag/tokens/v1/token/${token}`]){try{const r=await fetch(url,{headers:{"accept":"application/json","user-agent":"trading-journal/1.0"}});if(!r.ok)continue;const j=await r.json();if(j?.symbol)return{symbol:String(j.symbol),name:j?.name?String(j.name):null}}catch{}}return null}
async function evm(chain:string,token:string){const url=RPC[chain];if(!url)return null;let symbol=null,name=null;try{symbol=decodeString(await rpc(url,"eth_call",[{to:token,data:"0x95d89b41"},"latest"]))}catch{}try{name=decodeString(await rpc(url,"eth_call",[{to:token,data:"0x06fdde03"},"latest"]))}catch{}return symbol||name?{symbol,name}:null}
Deno.serve(async req=>{
 const {data:rt}=await db.from("sync_runtime").select("sync_key").eq("id",1).single();if(!rt||req.headers.get("x-sync-key")!==rt.sync_key)return out({error:"unauthorized"},401);
 const {data:rows,error}=await db.from("journal_positions").select("id,chain,token_address,symbol,token_name").not("token_address","is",null).order("created_at",{ascending:false}).limit(250);if(error)return out({error:error.message},500);
 let updated=0,skipped=0,failed=0;const results:any[]=[];
 for(const row of rows||[]){
   const placeholder=!row.symbol||row.symbol.includes("…")||/^0x[0-9a-f]{4}/i.test(row.symbol);
   if(!placeholder&&row.token_name){skipped++;continue}
   try{
     let m=await dex(row.token_address);
     if(!m&&row.chain==="sol")m=await pump(row.token_address);
     if(!m&&row.chain==="sol")m=await jupiter(row.token_address);
     if(!m&&row.chain!=="sol")m=await evm(row.chain,row.token_address);
     if(!m?.symbol&&!m?.name){skipped++;continue}
     const patch:any={};if(m.symbol)patch.symbol=m.symbol;if(m.name)patch.token_name=m.name;
     const {error:u}=await db.from("journal_positions").update(patch).eq("id",row.id);if(u)throw u;
     updated++;results.push({id:row.id,token:row.token_address,symbol:m.symbol,name:m.name});
   }catch(e){failed++;results.push({id:row.id,error:e instanceof Error?e.message:String(e)})}
 }
 return out({ok:true,updated,skipped,failed,results:results.slice(0,50)});
});