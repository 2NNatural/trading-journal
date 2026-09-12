import { Providers } from './providers.ts';
import { Transport } from './transport.ts';
import { Store } from './store.ts';
import { profile } from './profile.ts';
import { nativeMovements } from './traces.ts';

// Public endpoints advertised by their operators; no credentials are sent.
export async function freeRpcProbe(configured:Providers,store:Store){
  const sample=(store.read<any[]>('verification.json')??[]).find(x=>x.side==='sell'&&x.receiptStatus==='0x1');
  if(!sample)throw new Error('Run the receipt sample first.');
  const results:any[]=[];
  for(const url of ['https://robinhood-rpc.publicnode.com','https://rpc.mainnet.chain.robinhood.com']){
    const provider=new Providers({...configured.config,apiKey:'',rpcUrl:url,traceRpcUrl:url,secrets:[]},new Transport(store,[]));
    const result:any={endpoint:url,authentication:'NONE',txHash:sample.txHash,checks:[]};
    try{
      const chain=await provider.checkChain();result.checks.push({method:'eth_chainId',responseId:chain.id,chainId:chain.data});
      const receipt=await provider.rpc('eth_getTransactionReceipt',[sample.txHash]);
      result.checks.push({method:'eth_getTransactionReceipt',responseId:receipt.id,receiptFound:!!receipt.data,blockHashMatches:receipt.data?.blockHash===sample.blockHash});
      const trace=await provider.rpc('debug_traceTransaction',[sample.txHash,{tracer:'callTracer',tracerConfig:{onlyTopCall:false},timeout:'10s'}]);
      result.checks.push({method:'debug_traceTransaction',responseId:trace.id,profile:profile(trace.data)});
      result.traceReturned=true;
      try{result.nativeMovements=nativeMovements(trace.data,configured.config.wallet);}catch(e){result.parseStatus=e instanceof Error?e.message:'TRACE_SCHEMA_UNKNOWN';}
    }catch(e){result.error=e instanceof Error?e.message:'PUBLIC_RPC_ERROR';}
    results.push(result);store.write('free-rpc-probes.json',results);
  }
  return results.map(({checks,nativeMovements,...r})=>({...r,checks:checks.map(({profile,...c}:any)=>c),rawNativeDelta:nativeMovements?.rawDelta}));
}
