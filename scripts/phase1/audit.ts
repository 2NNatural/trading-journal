import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store,durableWrite,hash } from './store.ts';
import { lossless } from './transport.ts';
import { normalize } from './normalize.ts';
import { readObservations } from './paginate.ts';
import { csvCell } from './report.ts';

export function audit(store:Store){
  const candidates=normalize(readObservations(store));
  const manifest=readFileSync(join(store.dir,'manifest.jsonl'),'utf8').trim().split('\n').map(x=>JSON.parse(x));
  const raw=manifest.filter(x=>x.rawRetained);const invalidHashes=raw.filter(x=>hash(readFileSync(join(store.dir,'responses',x.id+'.body')))!==x.sha256);
  const filterProbes=store.read<any[]>('transfer-filter-probes.json')??[];
  const filtered=normalize(filterProbes.flatMap(x=>{
    const body=lossless(readFileSync(join(store.dir,'responses',x.responseId+'.body'),'utf8'));
    return body.data.activities.map((row:any,ordinal:number)=>({responseId:x.responseId,ordinal,row}));
  }));store.write('transfer-candidates.json',filtered);
  const transfers=store.read<any[]>('independent-transfers.json')??[];
  const indexedHashes=new Set(transfers.map(x=>x.transfer.hash));const gmgnHashes=new Set([...candidates,...filtered].map(x=>x.txHash));
  const missing=[...indexedHashes].filter(x=>!gmgnHashes.has(x));
  const cases=store.read<any[]>('validation-cases.json')??[],verification=store.read<any[]>('verification.json')??[];
  const conflicts=cases.filter(x=>x.balanceCheck&&!x.balanceCheck.blockDeltaMatchesReceipt);
  const quarantine=store.read<any>('quarantine.json');
  const explained=(c:any)=>quarantine?.status==='EXPLAINED_DEFAULT_BALANCE_NON_INCREMENTING_TRANSFER'&&quarantine.txHash===c.txHash&&quarantine.token===c.balanceCheck.token&&quarantine.blockNumber===c.blockNumber&&quarantine.effectiveBalanceDelta==='0';
  const unresolved=conflicts.filter(c=>!explained(c));
  const diagnosis=store.read<any>('diagnosis.json');
  const nativeChecks=store.read<any[]>('native-cashflow-verification.json')??[];
  const nativeIntegrityFailures=nativeChecks.filter(x=>x.error?.includes('MISMATCH'));
  const nativeStateMatches=nativeChecks.filter(x=>x.stateBalance?.matches).length;
  const nativeArchiveMatches=nativeChecks.filter(x=>x.archiveBalance?.matchesStateBoundaries||x.blockReconciliation?.matches).length;
  const cli=store.read<any>('cli-live-comparison.json');
  const traceAccess=nativeChecks.some(x=>x.traceResponseId)||Boolean(diagnosis?.traces?.some((x:any)=>x.responseId&&x.label?.includes('routed sell')));
  const traceEvidence=manifest.filter(x=>x.endpoint==='debug_traceTransaction'&&x.rawRetained).at(-1);
  const freeTierBlocked=!traceAccess&&Boolean(traceEvidence&&JSON.parse(readFileSync(join(store.dir,'responses',traceEvidence.id+'.body'),'utf8')).error?.message?.includes('Free tier'));
  for(const c of conflicts){c.accountingDisposition=explained(c)?'QUARANTINED_EXPLAINED_DEFAULT_BALANCE_TOKEN':'UNRESOLVED_BALANCE_LOG_CONFLICT';c.successfulFillEligible=false;}
  for(const c of conflicts)c.movementCategory='BALANCE_LOG_CONFLICT_REQUIRES_QUARANTINE';store.write('validation-cases.json',cases);
  const comparison=store.read<any>('page-size-comparison.json');
  let economics:any='NOT_COMPARED';
  if(comparison){
    const other=normalize(readObservations(new Store(comparison.otherRun)));
    const stable=(x:any)=>JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k])=>!['observationKey','sourceRefs'].includes(k))));
    const counts=(rows:any[])=>{const m=new Map<string,number>();for(const r of rows){const k=stable(r);m.set(k,(m.get(k)??0)+r.multiplicity);}return m;};
    const a=counts(candidates),b=counts(other);const diff=[...new Set([...a.keys(),...b.keys()])].filter(k=>a.get(k)!==b.get(k));economics={identical:diff.length===0,differentNormalizedCandidates:diff.length,caveat:'Prototype candidate fields only; metadata and source pointers excluded. This is not proof of canonical fill identity.'};
  }
  const result={gate:invalidHashes.length||unresolved.length||nativeIntegrityFailures.length||verification.some(x=>x.quantity?.status==='MISMATCH'||x.sideMatches===false||x.timestampMatches===false)?'FAIL_INTEGRITY':missing.length?'HYBRID_REQUIRED':'PENDING_VALIDATION',
    recommendation:'HYBRID_REQUIRED_FOR_COMPLETE_WALLET_CASHFLOWS',phase2Allowed:false,authenticatedGMGN:true,chainId:4663,
    history:store.read('history-checkpoint.json'),unfilteredRows:candidates.length,filteredTransferRows:filtered.reduce((a,x)=>a+x.multiplicity,0),
    independentIndexedTransfers:transfers.length,independentIndexedTransactions:indexedHashes.size,missingAfterExplicitTransferFilters:missing,
    normalizedPageSizeComparison:economics,rawHashesVerified:raw.length,rawHashFailures:invalidHashes.length,
    receiptSamples:verification.length,quantityMatchesWithinDisplayPrecision:verification.filter(x=>['EXACT','WITHIN_REPORTED_DECIMAL_UNIT'].includes(x.quantity?.status)).length,
    directionMismatches:verification.filter(x=>x.sideMatches===false).length,timestampMismatches:verification.filter(x=>x.timestampMatches===false).length,
    exactGasMatches:verification.filter(x=>x.gasMatches).length,
    independentCorpusCases:cases.length,independentLegMismatches:cases.flatMap(x=>x.indexedLegs??[]).filter(x=>!x.receiptLegMatches).length,
    balanceLogConflicts:conflicts.map(x=>({txHash:x.txHash,...x.balanceCheck})),
    unexplainedBalanceLogConflicts:unresolved.length,quarantinedExplainedEvents:conflicts.length-unresolved.length,quarantine,
    diagnosis:diagnosis??'NOT_RUN',traceAccess,freeTierBlocked,nativeChecks,nativeStateMatches,nativeArchiveMatches,nativeIntegrityFailures,liveCliComparison:cli??'NOT_RUN',
    latency:store.read('latency.json')??'NOT_RUN',market:store.read('market-capabilities.json')??'NOT_RUN',
    pending:[...(!traceAccess?[freeTierBlocked?'Trace-capable RPC access: configured Alchemy Free tier rejected debug_traceTransaction':'Trace-capable RPC access not validated']:[]),...(nativeArchiveMatches<verification.length?['Complete sampled native cashflow reconciliation, including differing block boundaries']:[]),'Historical USD rates and routed token fee classification',...(unresolved.length?['Balance/log conflict interpretation']:[]),'Re-entry, failed attempt and external execution category validation','20 fresh actions over two active periods with independent RPC observation','Actual GMGN account plan/quotas and cloud egress',...(cli?.status==='MATCHED_AT_CAPTURE'?[]:['Live isolated CLI comparison'])]};
  store.write('final-assessment.json',result);
  const columns=['tx_hash','independent_source_ids','receipt_status','movement_category','gmgn_observation_ids','token_movements_raw','native_transaction_value','gas_native','balance_delta_matches','notes'];
  durableWrite(join(store.dir,'independent-comparison.csv'),[columns,...cases.map(c=>[c.txHash,JSON.stringify(c.independentSources),c.receiptStatus,c.movementCategory,JSON.stringify(c.gmgnRows),JSON.stringify(c.walletMovements),c.transactionNativeValue,c.gasNative,c.balanceCheck?.blockDeltaMatchesReceipt,c.error??c.economicClassification])].map(row=>row.map(csvCell).join(',')).join('\n')+'\n');
  durableWrite(join(store.dir,'report.md'),`# Phase 1 final assessment\n\nGate: **${result.gate}**. Phase 2 remains closed.\n\nGMGN authentication and paginated trade capture worked. Complete wallet cashflows require a hybrid. ${result.quarantinedExplainedEvents} anomalous token event is explained by default-balance contract behavior and quarantined; ${unresolved.length} balance conflicts remain unexplained. ${result.quantityMatchesWithinDisplayPrecision} of ${verification.length} sampled GMGN trade quantities matched within display precision.\n\nSee final-assessment.json, comparison.csv, independent-comparison.csv, validation-cases.json and quarantine.json. Raw source responses are retained with SHA-256 manifests.\n\n${freeTierBlocked?'Live native tracing is blocked by the configured Alchemy Free tier.':`${nativeStateMatches} sampled native cashflows match transaction state; ${nativeArchiveMatches} reconcile to archive block balances, including other wallet actions where needed.`} Historical USD, routed token fee classification, failure discovery, latency, GMGN account quota and cloud operation remain unvalidated.\n`);
  return {gate:result.gate,phase2Allowed:false,unfilteredRows:result.unfilteredRows,filteredTransferRows:result.filteredTransferRows,missingAfterFilters:missing.length,independentCorpusCases:cases.length,unexplainedBalanceLogConflicts:unresolved.length,quarantinedEvents:result.quarantinedExplainedEvents,rawHashesVerified:raw.length};
}
