import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Decimal } from 'decimal.js';
import type { Providers } from './providers.ts';
import { Store } from './store.ts';
import { movements, quantityComparison } from './verify.ts';
import { normalize } from './normalize.ts';
import { readObservations } from './paginate.ts';

export async function corpus(providers:Providers,store:Store){
  await providers.checkChain();
  const transfers=store.read<any[]>('independent-transfers.json');if(!transfers)throw new Error('Run discover first.');
  const candidates=normalize(readObservations(store)),hashes=new Set(candidates.map(x=>x.txHash));
  const groups=new Map<string,any[]>();
  for(const x of transfers){const h=x.transfer.hash;groups.set(h,[...(groups.get(h)??[]),x]);}
  const ordered=[...groups.entries()].sort((a,b)=>Number(BigInt(b[1][0].transfer.blockNum)-BigInt(a[1][0].transfer.blockNum)));
  const selected=new Map(ordered.slice(0,18));
  for(const category of ['external','erc20']){const x=ordered.find(([h,rows])=>!selected.has(h)&&!hashes.has(h)&&rows.some(r=>r.transfer.category===category));if(x)selected.set(...x);}
  const missing=ordered.filter(([h])=>!hashes.has(h));
  store.write('independent-completeness.json',{indexedTransactions:groups.size,gmgnTransactions:hashes.size,indexedButAbsentFromUnfilteredGMGN:missing.map(([txHash,rows])=>({txHash,transfers:rows})),gmgnAbsentFromIndexed:[...hashes].filter(h=>h&&!groups.has(h)),caveat:'This is transfer-history coverage, not a list of missing trades. Spam/airdrops and funding are included; failed and internal-native transactions are not covered.'});
  const manifest=readFileSync(join(store.dir,'manifest.jsonl'),'utf8').trim().split('\n').map(x=>JSON.parse(x));
  const cached=async(method:string,params:any[])=>{
    const m=manifest.find(x=>x.endpoint===method&&JSON.stringify(x.params)===JSON.stringify(params)&&x.status===200);
    if(m){const wire=JSON.parse(readFileSync(join(store.dir,'responses',m.id+'.body'),'utf8'));if(!wire.error)return wire.result;}
    return (await providers.rpc(method,params)).data;
  };
  const cases:any[]=[];
  for(const [txHash,indexed] of selected){
    const c:any={txHash,independentSources:indexed.map(x=>({responseId:x.responseId,uniqueId:x.transfer.uniqueId})),gmgnRows:candidates.filter(x=>x.txHash===txHash).map(x=>x.observationKey),selection:'Newest 18 independent transfer transactions, plus absent native and ERC-20 examples when available.'};
    try{
      const receipt=await cached('eth_getTransactionReceipt',[txHash]);const tx=await cached('eth_getTransactionByHash',[txHash]);
      c.receiptStatus=receipt.status;c.blockNumber=receipt.blockNumber;c.gasNative=new Decimal(BigInt(receipt.gasUsed).toString()).mul(BigInt(receipt.effectiveGasPrice).toString()).div('1e18').toFixed();
      c.transactionNativeValue=new Decimal(BigInt(tx.value).toString()).div('1e18').toFixed();c.transactionFrom=tx.from;c.transactionTo=tx.to;
      c.walletMovements=movements(receipt,providers.config.wallet);c.successfulFillEligible=false;
      c.indexedLegs=indexed.map(({transfer:t})=>({uniqueId:t.uniqueId,category:t.category,raw:t.rawContract?.value,contract:t.rawContract?.address,
        receiptLegMatches:t.category==='erc20'?receipt.logs.some((l:any)=>`${txHash}:log:${Number(BigInt(l.logIndex))}`===t.uniqueId&&l.address.toLowerCase()===t.rawContract.address.toLowerCase()&&BigInt(l.data)===BigInt(t.rawContract.value)):tx.value===t.rawContract.value&&tx.from.toLowerCase()===t.from.toLowerCase()&&tx.to?.toLowerCase()===t.to.toLowerCase()}));
      const token=Object.keys(c.walletMovements).find(t=>indexed.some(x=>x.transfer.rawContract?.address?.toLowerCase()===t));
      if(token&&receipt.status==='0x1'){
        const selector='0x70a08231'+providers.config.wallet.slice(2).padStart(64,'0');
        const before='0x'+(BigInt(receipt.blockNumber)-1n).toString(16);
        const pre=await cached('eth_call',[{to:token,data:selector},before]);const post=await cached('eth_call',[{to:token,data:selector},receipt.blockNumber]);
        const preRaw=BigInt(pre),postRaw=BigInt(post),delta=BigInt(c.walletMovements[token]);
        c.balanceCheck={token,preRaw:preRaw.toString(),postRaw:postRaw.toString(),blockDeltaMatchesReceipt:postRaw-preRaw===delta,caveat:'Block-boundary snapshots; another same-block action can affect the delta.'};
        c.movementCategory=delta>0n?(preRaw===0n?'OPENING_INFLOW':'ADDITIONAL_INFLOW'):(postRaw===0n?'FULL_BALANCE_OUTFLOW':'PARTIAL_BALANCE_OUTFLOW');
        if(postRaw-preRaw!==delta)c.movementCategory='BALANCE_LOG_CONFLICT_REQUIRES_QUARANTINE';
        c.quantityComparisons=candidates.filter(x=>x.txHash===txHash&&x.token===token).map(x=>{
          const d=indexed.find(y=>y.transfer.rawContract?.address?.toLowerCase()===token)?.transfer.rawContract.decimal;
          return {observationKey:x.observationKey,...quantityComparison(x.quantity,delta.toString(),Number(BigInt(d)))};
        });
      }
      c.economicClassification='Movement category only; trade vs transfer, routing and re-entry need complete cashflow interpretation.';
    }catch(e){c.error=e instanceof Error?e.message:'CORPUS_ERROR';}
    cases.push(c);store.write('validation-cases.json',cases);
  }
  return {cases:cases.length,missingFromGMGN:missing.length,errors:cases.filter(x=>x.error).length};
}
