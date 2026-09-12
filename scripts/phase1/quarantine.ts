import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Providers } from './providers.ts';
import { Store,hash,durableWrite } from './store.ts';

// Bounded diagnosis for this observed contract, not a general EVM decompiler.
export async function quarantine(providers:Providers,store:Store){
  await providers.checkChain();
  const c=(store.read<any[]>('validation-cases.json')??[]).find(x=>x.balanceCheck&&!x.balanceCheck.blockDeltaMatchesReceipt);
  if(!c)throw new Error('No recorded balance/log conflict.');
  const token=c.balanceCheck.token,block=c.blockNumber,before='0x'+(BigInt(block)-1n).toString(16);
  const diagnosis=store.read<any>('diagnosis.json');
  const codeRef=diagnosis?.conflictChecks.find((x:any)=>x.method==='eth_getCode'&&x.responseId);
  if(!codeRef)throw new Error('Run diagnose first.');
  const oldCode=JSON.parse(readFileSync(join(store.dir,'responses',codeRef.responseId+'.body'),'utf8')).result;
  const bytes=Buffer.from(oldCode.slice(2),'hex');
  // Reviewed dispatcher routes balanceOf to 0x7a8. The nonzero-address branch
  // computes keccak(address, slot 8), SLOADs, then uses slot 4 when zero.
  const branch='5b6001600160a01b0382165f908152600860205260408120549081900361082f57506004545b9291505056';
  if(bytes.subarray(0x80a,0x835).toString('hex')!==branch)throw new Error('BYTECODE_REVIEW_BINDING_MISMATCH');
  const references:any[]=[];
  const read=async(method:string,params:any[])=>{const r=await providers.rpc(method,params);references.push({method,params,responseId:r.id,result:r.data});return r.data;};
  const key=await read('web3_sha3',['0x'+providers.config.wallet.slice(2).padStart(64,'0')+'8'.padStart(64,'0')]);
  const values:any={};
  for(const [name,at]of [['before',before],['after',block]]){
    values[name]={mappingRaw:BigInt(await read('eth_getStorageAt',[token,key,at])).toString(),defaultRaw:BigInt(await read('eth_getStorageAt',[token,'0x4',at])).toString()};
  }
  const predicted=(v:any)=>BigInt(v.mappingRaw)!==0n?v.mappingRaw:v.defaultRaw;
  const matches=predicted(values.before)===c.balanceCheck.preRaw&&predicted(values.after)===c.balanceCheck.postRaw;
  const status=matches&&predicted(values.before)===predicted(values.after)?'EXPLAINED_DEFAULT_BALANCE_NON_INCREMENTING_TRANSFER':'UNRESOLVED';
  const result={status,txHash:c.txHash,token,blockNumber:block,codeResponseId:codeRef.responseId,codeSha256:hash(oldCode),bytecodeBranch:{start:'0x80a',endExclusive:'0x835',bytes:branch,interpretation:'balanceOf reads mapping at storage slot 8; if zero it returns storage slot 4 instead.'},storage:values,references,
    emittedRawDelta:c.walletMovements[token],effectiveBalanceDelta:(BigInt(c.balanceCheck.postRaw)-BigInt(c.balanceCheck.preRaw)).toString(),
    disposition:status==='UNRESOLVED'?'KEEP_GATE_FAILED':'QUARANTINE_UNSUPPORTED_TOKEN_EVENT',
    accounting:'Preserve raw log and anomalous balances. Exclude this event from fills, acquired quantity and cost basis. Do not infer ownership from a default balance; do not replace unknown basis with zero.',
    limitations:'Storage interpretation is bound to the captured runtime bytecode. No general claim of malicious intent or transferability. Independent historical public RPC was unavailable; provider evidence and bytecode semantics agree.'};
  store.write('quarantine.json',result);
  durableWrite(join(store.dir,'conflict-bytecode-analysis.md'),`# Observed default-balance token\n\nStatus: ${status}\n\nThe captured runtime dispatcher routes balanceOf (0x70a08231) to 0x7a8. At 0x80a–0x834, the nonzero-address path hashes the wallet address with slot 8 and SLOADs its mapping value. If that is zero, it returns slot 4.\n\nThe pre/post historical storage values reproduce both balanceOf answers. An emitted Transfer is therefore not an observed increase in the wallet balance for this case. Preserve the evidence and quarantine the event from position calculations. This is contract-specific analysis, not a blanket spam or ownership classifier.\n\nBytecode SHA-256: ${result.codeSha256}. Exact bytes, RPC response IDs and storage values are recorded in quarantine.json.\n`);
  return {status,storage:values,effectiveBalanceDelta:result.effectiveBalanceDelta,disposition:result.disposition};
}
