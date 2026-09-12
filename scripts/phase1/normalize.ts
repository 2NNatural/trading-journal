import { Decimal } from 'decimal.js';
import { hash } from './store.ts';
import { scalar } from './transport.ts';
Decimal.set({precision:100});
export const decimal=(x:unknown):string|null=>{
  const s=scalar(x);if(s===undefined||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(s))return null;
  try{return new Decimal(s).isFinite()?s:null;}catch{return null;}
};
export interface Candidate {
  observationKey:string;sourceRefs:{responseId:string;ordinal:number}[];
  txHash:string|null;token:string|null;side:string;quantity:string|null;quoteAddress:string|null;quoteQuantity:string|null;
  reportedUsd:string|null;reportedPriceUsd:string|null;reportedPriceQuote:string|null;reportedBasisUsd:string|null;
  timestamp:string|null;reportedGasNative:string|null;reportedGasUsd:string|null;reportedDexNative:string|null;reportedDexUsd:string|null;
  issues:string[];multiplicity:number;identityStatus:'OBSERVATION_ONLY_NOT_CANONICAL_FILL';
}
export function normalize(observations:any[]):Candidate[]{
  const candidates=new Map<string,Candidate>();const multiplicities=new Map<string,Map<string,number>>();
  for(const {row:r,responseId,ordinal}of observations){
    const k=hash(JSON.stringify(r));let c=candidates.get(k);
    if(!c){
      const rawSide=String(r.event_type??r.type??'unknown');
      const side=rawSide==='transfer_in'?'transferIn':rawSide==='transfer_out'?'transferOut':rawSide;const token=r.token?.address;
      c={observationKey:k,sourceRefs:[],txHash:/^0x[\da-f]{64}$/i.test(r.tx_hash??'')?r.tx_hash.toLowerCase():null,
        token:/^0x[\da-f]{40}$/i.test(token??'')?token.toLowerCase():null,side,quantity:decimal(r.token_amount),
        quoteAddress:r.quote_address??r.quote_token?.token_address??null,quoteQuantity:decimal(r.quote_amount),reportedUsd:decimal(r.cost_usd),
        reportedPriceUsd:decimal(r.price_usd),reportedPriceQuote:decimal(r.price),reportedBasisUsd:decimal(r.buy_cost_usd),timestamp:decimal(r.timestamp),
        reportedGasNative:decimal(r.gas_native),reportedGasUsd:decimal(r.gas_usd),reportedDexNative:decimal(r.dex_native),reportedDexUsd:decimal(r.dex_usd),
        issues:[],multiplicity:1,identityStatus:'OBSERVATION_ONLY_NOT_CANONICAL_FILL'};
      if(!c.txHash)c.issues.push('MISSING_OR_INVALID_HASH');if(!c.token)c.issues.push('MISSING_OR_INVALID_TOKEN');
      if(!c.quantity)c.issues.push('MISSING_OR_INVALID_QUANTITY');
      if(!['buy','sell','transferIn','transferOut'].includes(side))c.issues.push('UNMAPPED_ACTIVITY_KIND');
      if(!c.reportedUsd)c.issues.push('USD_UNKNOWN');
      candidates.set(k,c);
    }
    c.sourceRefs.push({responseId,ordinal});
    const counts=multiplicities.get(responseId)??new Map();counts.set(k,(counts.get(k)??0)+1);multiplicities.set(responseId,counts);
    c.multiplicity=Math.max(c.multiplicity,counts.get(k)!);
  }
  const all=[...candidates.values()];
  const economicGroups=new Map<string,number>();
  for(const c of all){const k=`${c.txHash}:${c.token}:${c.side}`;economicGroups.set(k,(economicGroups.get(k)??0)+c.multiplicity);}
  for(const c of all)if((economicGroups.get(`${c.txHash}:${c.token}:${c.side}`)??0)>1)c.issues.push('MULTIPLICITY_OR_REVISION_REQUIRES_CHAIN_RESOLUTION');
  return all;
}
