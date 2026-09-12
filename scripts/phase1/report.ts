import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Candidate } from './normalize.ts';
import { Store, durableWrite } from './store.ts';
export function csvCell(x:unknown){let s=x==null?'':String(x);if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function report(store:Store,candidates:Candidate[]){
  const verification=store.read<any[]>('verification.json')??[];
  const history=store.read<any>('history-checkpoint.json');
  const observations=candidates.reduce((n,c)=>n+c.sourceRefs.length,0);
  const summary={gate:'PENDING_VALIDATION',candidateObservations:observations,distinctObservedPayloads:candidates.length,historyTraversal:history??'NOT_RUN',
    kinds:candidates.reduce((a,c)=>{a[c.side]=(a[c.side]??0)+1;return a;},{} as Record<string,number>),
    verificationSamples:verification.length,quantityStatuses:verification.reduce((a,r)=>{const k=r.quantity?.status??'ERROR';a[k]=(a[k]??0)+1;return a;},{} as Record<string,number>),
    sideMismatches:verification.filter(r=>r.sideMatches===false).length,timestampMismatches:verification.filter(r=>r.timestampMatches===false).length,
    unvalidated:['independent corpus category coverage','historical USD and fee semantics','ongoing latency across two periods','account plan/quotas','cloud egress'],
    caveat:'Raw observations are not canonical fills. Terminal pagination does not prove independently complete wallet history.'};
  store.write('summary.json',summary);
  const headers=['tx_hash','side','token','base_raw_delta','exact_quantity','gmgn_quantity','quantity_status','side_matches','timestamp_matches','receipt_status','gas_native','gmgn_gas_native','gmgn_usd','independent_usd','notes'];
  const rows=verification.map(r=>[r.txHash,r.side,r.token,r.baseRawDelta,r.quantity?.exactQuantity,r.quantity?.reportedQuantity,r.quantity?.status,r.sideMatches,r.timestampMatches,r.receiptStatus,r.gasNative,r.reportedGasNative,r.reportedUsd,r.independentUsd,r.error??r.usdStatus]);
  durableWrite(join(store.dir,'comparison.csv'),[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\n')+'\n');
  durableWrite(join(store.dir,'report.md'),`# Phase 1 run\n\nGate: **PENDING_VALIDATION**\n\n\`\`\`json\n${JSON.stringify(summary,null,2)}\n\`\`\`\n\nSee comparison.csv, verification.json and exact response bodies. This report deliberately does not infer a provider pass from a working endpoint.\n`);
  return summary;
}
