import { createClient } from "npm:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!,anonKey=Deno.env.get("SUPABASE_ANON_KEY")!,serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(url,serviceKey,{auth:{persistSession:false}}),ALLOWED=new Set(["robinhood","sol","arc","bsc"]);
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"content-type":"application/json"}});
function normalize(chain:string,value:unknown){const raw=String(value??"").trim();if(["robinhood","arc","bsc"].includes(chain)){if(!/^0x[0-9a-fA-F]{40}$/.test(raw))throw new Error(`Invalid ${chain} wallet address.`);return raw.toLowerCase()}if(chain==="sol"){if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw))throw new Error("Invalid Solana wallet address.");return raw}throw new Error("Unsupported chain.")}
function chainId(c:string){if(c==="robinhood")return 4663;if(c==="arc")return 5042;if(c==="bsc")return 56;return null}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return respond({error:"method not allowed"},405);
  const auth=req.headers.get("authorization")||"";if(!auth.toLowerCase().startsWith("bearer "))return respond({error:"unauthorized"},401);
  const client=createClient(url,anonKey,{auth:{persistSession:false},global:{headers:{Authorization:auth}}});const {data:u,error:ue}=await client.auth.getUser();if(ue||!u.user)return respond({error:"unauthorized"},401);
  const body=await req.json().catch(()=>({})),items=Array.isArray(body.wallets)?body.wallets:[];if(!items.length||items.length>10)return respond({error:"Provide between 1 and 10 wallets."},400);
  let wallets:any[];try{wallets=items.map((x:any,i:number)=>{const chain=String(x?.chain??"").trim().toLowerCase();if(!ALLOWED.has(chain))throw new Error(`Unsupported chain at wallet ${i+1}.`);return{chain,address:normalize(chain,x?.address),label:String(x?.label??`${chain.toUpperCase()} wallet`).trim().slice(0,80)||`${chain.toUpperCase()} wallet`,chain_id:chainId(chain)}})}catch(e){return respond({error:e instanceof Error?e.message:String(e)},400)}
  const seen=new Set<string>();for(const w of wallets){const k=`${w.chain}:${w.address}`;if(seen.has(k))return respond({error:`Duplicate wallet: ${w.chain} ${w.address}`},400);seen.add(k)}
  const uid=u.user.id;const {error:d}=await admin.from("wallets").update({sync_enabled:false}).eq("user_id",uid);if(d)return respond({error:d.message},500);
  const {data:saved,error:we}=await admin.from("wallets").upsert(wallets.map(w=>({user_id:uid,...w,sync_enabled:true})),{onConflict:"user_id,chain,address"}).select("id,chain,address,label,sync_enabled");if(we)return respond({error:we.message},500);
  await admin.from("sync_config").update({enabled:false,gmgn_api_key:null,wallet_address:null,updated_at:new Date().toISOString()}).eq("user_id",uid);
  await admin.from("sync_state").update({status:"DISABLED",error_code:null,retry_after:null}).eq("user_id",uid).eq("source","gmgn");
  const {data:rt}=await admin.from("sync_runtime").select("sync_key").eq("id",1).single();let syncTriggered=false;if(rt?.sync_key){const r=await fetch(`${url}/functions/v1/journal-chain-sync-lite`,{method:"POST",headers:{"content-type":"application/json","x-sync-key":rt.sync_key},body:JSON.stringify({user_id:uid})});syncTriggered=r.ok}
  return respond({ok:true,wallets:saved??[],sync_triggered:syncTriggered,source:"chain-rpc"});
});