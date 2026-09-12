import { Providers } from './providers.ts';
import { Store,hash } from './store.ts';
import { TRANSFER } from './verify.ts';
import { profile } from './profile.ts';

export async function diagnose(providers:Providers,store:Store){
  await providers.checkChain();
  const verification=store.read<any[]>('verification.json')??[];
  const conflict=(store.read<any[]>('validation-cases.json')??[]).find(x=>x.balanceCheck&&!x.balanceCheck.blockDeltaMatchesReceipt);
  const results:any={startedAt:new Date().toISOString(),traces:[],conflictChecks:[]};
  const capture=async(label:string,p:Providers,method:string,params:any[],target:any[])=>{
    try{const r=await p.rpc(method,params);const item={label,responseId:r.id,method,params,profile:profile(r.data)};target.push(item);store.write('diagnosis.json',results);return r;}
    catch(e){target.push({label,method,params,error:e instanceof Error?e.message:'DIAGNOSIS_ERROR'});store.write('diagnosis.json',results);return null;}
  };
  const first=verification.find(x=>x.side==='sell'&&x.receiptStatus==='0x1');
  const trace=first?await capture('configured RPC / routed sell',providers,'debug_traceTransaction',[first.txHash,{tracer:'callTracer',tracerConfig:{onlyTopCall:false},timeout:'10s'}],results.traces):null;
  results.traceCapability=trace?'RETURNED_NEEDS_SCHEMA_VALIDATION':'UNAVAILABLE_IN_PROBE';
  if(conflict){
    const token=conflict.balanceCheck.token,block=conflict.blockNumber,before='0x'+(BigInt(block)-1n).toString(16);
    const selector='0x70a08231'+providers.config.wallet.slice(2).padStart(64,'0');
    const publicRpc=new Providers({...providers.config,rpcUrl:'https://rpc.mainnet.chain.robinhood.com'},providers.transport);
    await publicRpc.checkChain();
    for(const at of [before,block]){
      const r=await capture('public RPC / historical balance',publicRpc,'eth_call',[{to:token,data:selector},at],results.conflictChecks);
      if(r)results.conflictChecks.at(-1).balanceRaw=BigInt(r.data).toString();
    }
    const code=await capture('configured RPC / contract code',providers,'eth_getCode',[token,block],results.conflictChecks);
    if(code)results.conflictChecks.at(-1).codeSha256=hash(String(code.data));
    const walletTopic='0x'+providers.config.wallet.slice(2).padStart(64,'0');
    for(const topics of [[TRANSFER,walletTopic],[TRANSFER,null,walletTopic]]){
      const r=await capture('configured RPC / same-block wallet logs',providers,'eth_getLogs',[{address:token,fromBlock:block,toBlock:block,topics}],results.conflictChecks);
      if(r)results.conflictChecks.at(-1).logCount=Array.isArray(r.data)?r.data.length:null;
    }
    if(trace){await capture('configured RPC / conflicting transfer state diff',providers,'debug_traceTransaction',[conflict.txHash,{tracer:'prestateTracer',tracerConfig:{diffMode:true},timeout:'10s'}],results.traces);}
  }
  store.write('diagnosis.json',results);
  return {traceCapability:results.traceCapability,traces:results.traces.map((x:any)=>({label:x.label,responseId:x.responseId,error:x.error})),conflictChecks:results.conflictChecks.map((x:any)=>({label:x.label,balanceRaw:x.balanceRaw,logCount:x.logCount,error:x.error}))};
}
