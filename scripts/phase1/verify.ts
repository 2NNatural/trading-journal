import { Decimal } from 'decimal.js';
import type { Providers } from './providers.ts';
import type { Candidate } from './normalize.ts';
import { Store } from './store.ts';
export const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export function movements(receipt:any,wallet:string):Record<string,string>{
  const deltas:Record<string,bigint>={};wallet=wallet.toLowerCase();
  for(const l of receipt.logs??[]){
    if(l.topics?.[0]?.toLowerCase()!==TRANSFER||l.topics.length!==3||!/^0x[\da-f]{64}$/i.test(l.data??''))continue;
    const from='0x'+l.topics[1].slice(-40).toLowerCase(),to='0x'+l.topics[2].slice(-40).toLowerCase();
    const address=l.address.toLowerCase(),q=BigInt(l.data);
    deltas[address]=(deltas[address]??0n)+(to===wallet?q:0n)-(from===wallet?q:0n);
  }
  return Object.fromEntries(Object.entries(deltas).filter(([,v])=>v!==0n).map(([k,v])=>[k,v.toString()]));
}
export function quantityComparison(reported:string|null,raw:string,decimals:number){
  const exact=new Decimal(raw).abs().div(new Decimal(10).pow(decimals));
  if(reported===null)return {exactQuantity:exact.toFixed(),status:'REPORTED_QUANTITY_UNKNOWN'};
  const d=exact.minus(reported).abs();
  const displayUnit=new Decimal(10).pow(-new Decimal(reported).decimalPlaces());
  return {exactQuantity:exact.toFixed(),reportedQuantity:reported,difference:d.toFixed(),status:d.isZero()?'EXACT':d.lte(displayUnit)?'WITHIN_REPORTED_DECIMAL_UNIT':'MISMATCH'};
}
export async function verify(providers:Providers,store:Store,candidates:Candidate[],max=20){
  await providers.checkChain();
  const decimalsCache=new Map<string,number>();const blocks=new Map<string,any>();const receipts=new Map<string,any>();
  const results:any[]=[];
  const sample=candidates.filter(x=>x.txHash&&x.token&&['buy','sell','transferIn','transferOut'].includes(x.side)).slice(0,max);
  for(const c of sample){
    try{
      const tx=c.txHash!,token=c.token!;
      if(!receipts.has(tx))receipts.set(tx,(await providers.rpc('eth_getTransactionReceipt',[tx])).data);
      const receipt=receipts.get(tx);if(!receipt)throw new Error('RECEIPT_NOT_FOUND');
      if(!blocks.has(receipt.blockNumber))blocks.set(receipt.blockNumber,(await providers.rpc('eth_getBlockByNumber',[receipt.blockNumber,false])).data);
      const block=blocks.get(receipt.blockNumber);
      if(receipt.status==='0x0'){
        results.push({observationKey:c.observationKey,txHash:tx,receiptStatus:receipt.status,successfulFillEligible:false,gasNative:new Decimal(BigInt(receipt.gasUsed).toString()).mul(BigInt(receipt.effectiveGasPrice).toString()).div('1e18').toFixed(),classification:'FAILED_ATTEMPT_NO_FILL'});
        store.write('verification.json',results);continue;
      }
      const deltas=movements(receipt,providers.config.wallet);
      const getDecimals=async(address:string)=>{
        if(!decimalsCache.has(address)){
          const r=await providers.rpc('eth_call',[{to:address,data:'0x313ce567'},receipt.blockNumber]);
          if(!/^0x[\da-f]+$/i.test(r.data??''))throw new Error('DECIMALS_UNAVAILABLE');
          const n=Number(BigInt(r.data));if(!Number.isInteger(n)||n<0||n>255)throw new Error('INVALID_DECIMALS');decimalsCache.set(address,n);
        }
        return decimalsCache.get(address)!;
      };
      const tokenDecimals=await getDecimals(token);const baseDelta=deltas[token]??'0';
      const expectedPositive=['buy','transferIn'].includes(c.side);
      const sideMatches=expectedPositive?BigInt(baseDelta)>0n:BigInt(baseDelta)<0n;
      const blockTime=Number(BigInt(block.timestamp));
      const cost=new Decimal(BigInt(receipt.gasUsed).toString()).mul(BigInt(receipt.effectiveGasPrice).toString()).div('1e18');
      let quote:any=null;
      if(c.quoteAddress&&/^0x[\da-f]{40}$/i.test(c.quoteAddress)&&deltas[c.quoteAddress.toLowerCase()]!==undefined){
        const qd=await getDecimals(c.quoteAddress.toLowerCase());
        quote={rawDelta:deltas[c.quoteAddress.toLowerCase()],...quantityComparison(c.quoteQuantity,deltas[c.quoteAddress.toLowerCase()],qd)};
      }
      const result={observationKey:c.observationKey,txHash:tx,side:c.side,token,receiptStatus:receipt.status,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,
        blockTime:new Date(blockTime*1000).toISOString(),timestampMatches:c.timestamp!==null&&Number(c.timestamp)===blockTime,
        baseRawDelta:baseDelta,tokenDecimals,sideMatches,quantity:quantityComparison(c.quantity,baseDelta,tokenDecimals),quote,
        gasNative:cost.toFixed(),reportedGasNative:c.reportedGasNative,gasMatches:c.reportedGasNative!==null&&cost.eq(c.reportedGasNative),
        reportedUsd:c.reportedUsd,independentUsd:null,usdStatus:'UNVALIDATED_NO_INDEPENDENT_HISTORICAL_RATE',walletMovements:deltas,
        identityStatus:c.issues.includes('MULTIPLICITY_OR_REVISION_REQUIRES_CHAIN_RESOLUTION')?'AMBIGUOUS_MULTIPLICITY':'WALLET_NET_MOVEMENT_COMPARISON',
        sourceLimit:'Sample selected from GMGN; not independent evidence of wallet-history completeness.'};
      results.push(result);store.write('verification.json',results);
    }catch(e){results.push({observationKey:c.observationKey,txHash:c.txHash,error:e instanceof Error?e.message:'VERIFY_ERROR'});store.write('verification.json',results);}
  }
  return results;
}
