import type { Providers } from './providers.ts';
import { Store } from './store.ts';
export async function discover(providers:Providers,store:Store,maxPages=5){
  await providers.checkChain();
  const block=(await providers.rpc('eth_blockNumber')).data;
  const results:any[]=[];const coverage:any[]=[];
  for(const category of [['external','erc20'],['internal']])for(const direction of ['fromAddress','toAddress']){
    let pageKey:string|undefined;const seen=new Set<string>();let done=false;
    try{
      for(let n=0;n<maxPages;n++){
        const request={fromBlock:'0x0',toBlock:block,[direction]:providers.config.wallet,category,withMetadata:true,excludeZeroValue:true,order:'desc',maxCount:'0x64',...(pageKey?{pageKey}:{})};
        const r=await providers.rpc('alchemy_getAssetTransfers',[request]);
        if(!Array.isArray(r.data?.transfers))throw new Error('TRANSFER_SCHEMA_UNKNOWN');
        results.push(...r.data.transfers.map((x:any)=>({direction,responseId:r.id,transfer:x})));
        store.write('independent-transfers.json',results);
        pageKey=r.data.pageKey;
        if(!pageKey){done=true;break;}
        if(seen.has(pageKey))throw new Error('TRANSFER_CURSOR_LOOP');seen.add(pageKey);
      }
      coverage.push({direction,done,toBlock:block,stopReason:done?'TERMINAL_PAGE':'PAGE_BUDGET_EXHAUSTED',categories:category,failedTransactions:'NOT_COVERED'});
    }catch(e){coverage.push({direction,categories:category,done:false,error:e instanceof Error?e.message:'DISCOVERY_ERROR'});}
    store.write('independent-coverage.json',coverage);
  }
  return {rows:results.length,coverage};
}
