import { Decimal } from 'decimal.js';
import type { Providers } from './providers.ts';
import { Store } from './store.ts';
import { hash } from './store.ts';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { lossless } from './transport.ts';

const address=(x:unknown):x is string=>typeof x==='string'&&/^0x[\da-f]{40}$/i.test(x);
const integer=(x:unknown):bigint=>{
  if(typeof x!=='string'||!/^0x[\da-f]+$/i.test(x))throw new Error('TRACE_INTEGER_SCHEMA_UNKNOWN');
  return BigInt(x);
};
export function nativeMovements(root:any,wallet:string){
  if(!address(wallet)||!root||Array.isArray(root)||typeof root!=='object')throw new Error('TRACE_SCHEMA_UNKNOWN');
  const legs:any[]=[];let nodes=0;wallet=wallet.toLowerCase();
  function visit(frame:any,path:number[],ancestorReverted:boolean){
    if(++nodes>100_000||path.length>128)throw new Error('TRACE_COMPLEXITY_LIMIT');
    if(!frame||typeof frame!=='object'||!address(frame.from))throw new Error('TRACE_FRAME_SCHEMA_UNKNOWN');
    if(frame.calls!==undefined&&!Array.isArray(frame.calls))throw new Error('TRACE_CHILDREN_SCHEMA_UNKNOWN');
    // Arbitrum system transfer arrays may include gas charges/refunds. Their
    // semantics must be inspected before counting them alongside receipt gas.
    for(const field of ['beforeEVMTransfers','afterEVMTransfers']){
      if(frame[field]!==undefined&&!Array.isArray(frame[field]))throw new Error('SYSTEM_TRANSFERS_SCHEMA_UNKNOWN');
      if(frame[field]?.length)throw new Error('SYSTEM_TRANSFERS_REQUIRE_INTERPRETATION');
    }
    const type=String(frame.type??'').toUpperCase();
    if(!['CALL','CREATE','CREATE2','SELFDESTRUCT','SUICIDE','STATICCALL','DELEGATECALL','CALLCODE'].includes(type))throw new Error('TRACE_CALL_TYPE_UNKNOWN');
    const reverted=ancestorReverted||Boolean(frame.error);
    if(['SELFDESTRUCT','SUICIDE'].includes(type)&&frame.value===undefined)throw new Error('SELFDESTRUCT_VALUE_UNKNOWN');
    const value=frame.value===undefined?0n:integer(frame.value);
    if(!reverted&&value!==0n&&['CALL','CREATE','CREATE2','SELFDESTRUCT','SUICIDE'].includes(type)){
      if(!address(frame.to))throw new Error('TRACE_RECIPIENT_UNKNOWN');
      const from=frame.from.toLowerCase(),to=frame.to.toLowerCase();
      if(from===wallet||to===wallet)legs.push({path,type,from,to,rawValue:value.toString(),rawDelta:((to===wallet?value:0n)-(from===wallet?value:0n)).toString()});
    }
    for(const [index,child]of(frame.calls??[]).entries())visit(child,[...path,index],reverted);
  }
  visit(root,[],false);
  return {rawDelta:legs.reduce((a,x)=>a+BigInt(x.rawDelta),0n).toString(),legs,nodes};
}

// Nitro attaches transfers outside EVM execution to the root call frame.
// Support the observed ordinary transaction fee scheme only; retryable/bridge
// purposes require their own interpretation. Fees still apply to reverted calls.
export function nativeAccounting(root:any,wallet:string,receiptGasWei:bigint){
  if(!address(root?.from)||receiptGasWei<0n)throw new Error('TRACE_SCHEMA_UNKNOWN');
  wallet=wallet.toLowerCase();
  const hasSystem=root.beforeEVMTransfers!==undefined||root.afterEVMTransfers!==undefined;
  let system:any=null;
  if(hasSystem){
    const before=root.beforeEVMTransfers,after=root.afterEVMTransfers;
    if(!Array.isArray(before)||!Array.isArray(after)||before.length!==1||after.length<2)throw new Error('SYSTEM_TRANSFERS_SCHEMA_UNKNOWN');
    const payer=root.from.toLowerCase();
    const payment=before[0],refunds=after.filter(x=>x?.purpose==='gasRefund'),collections=after.filter(x=>x?.purpose==='feeCollection');
    if(payment?.purpose!=='feePayment'||!address(payment.from)||payment.from.toLowerCase()!==payer||payment.to!==null||refunds.length!==1||collections.length+1!==after.length)throw new Error('SYSTEM_TRANSFERS_REQUIRE_INTERPRETATION');
    const refund=refunds[0];
    if(refund.from!==null||!address(refund.to)||refund.to.toLowerCase()!==payer||collections.some(x=>x.from!==null||!address(x.to)))throw new Error('SYSTEM_TRANSFERS_REQUIRE_INTERPRETATION');
    const paid=integer(payment.value),returned=integer(refund.value),collected=collections.reduce((a,x)=>a+integer(x.value),0n);
    if(paid-returned!==receiptGasWei||collected!==receiptGasWei)throw new Error('SYSTEM_GAS_RECEIPT_MISMATCH');
    const legs=[...before,...after].map(x=>({purpose:x.purpose,from:x.from?.toLowerCase()??null,to:x.to?.toLowerCase()??null,rawValue:integer(x.value).toString(),rawDelta:((x.to?.toLowerCase()===wallet?integer(x.value):0n)-(x.from?.toLowerCase()===wallet?integer(x.value):0n)).toString()}));
    system={legs,rawDelta:legs.reduce((a,x)=>a+BigInt(x.rawDelta),0n).toString(),receiptGasMatches:true};
  }
  const {beforeEVMTransfers,afterEVMTransfers,...calls}=root;
  const movement=nativeMovements(calls,wallet);
  const gasCharged=root.from.toLowerCase()===wallet?receiptGasWei:0n;
  // System transfers already include fee payments/refunds; never subtract gas twice.
  const net=BigInt(movement.rawDelta)+(system?BigInt(system.rawDelta):-gasCharged);
  return {movement,system,rawGasCharged:gasCharged.toString(),rawNetIncludingGas:net.toString()};
}

export function stateBalanceDelta(diff:any,wallet:string){
  const pre=diff?.pre?.[wallet.toLowerCase()],post=diff?.post?.[wallet.toLowerCase()];
  // In diff mode an omitted balance can mean unchanged; do not guess zero or
  // conflate account creation/deletion with an observed balance on both sides.
  if(pre?.balance===undefined||post?.balance===undefined)throw new Error('STATE_BALANCE_NOT_EXPLICIT');
  return {preRaw:integer(pre.balance).toString(),postRaw:integer(post.balance).toString(),rawDelta:(integer(post.balance)-integer(pre.balance)).toString()};
}

export function balanceSequenceMatches(rows:{index:string;preRaw:string;postRaw:string}[],preRaw:string,postRaw:string){
  const sorted=[...rows].sort((a,b)=>integer(a.index)<integer(b.index)?-1:integer(a.index)>integer(b.index)?1:0);
  if(!sorted.length||new Set(sorted.map(x=>integer(x.index).toString())).size!==sorted.length)return false;
  let balance=preRaw;
  for(const row of sorted){if(row.preRaw!==balance)return false;balance=row.postRaw;}
  return balance===postRaw;
}

const native=(raw:string)=>{
  const n=BigInt(raw),abs=n<0n?-n:n;
  const fraction=(abs%10n**18n).toString().padStart(18,'0').replace(/0+$/,'');
  return (n<0n?'-':'')+(abs/10n**18n).toString()+(fraction?'.'+fraction:'');
};

export async function traceSample(providers:Providers,store:Store,max=2){
  await providers.checkChain();
  const manifestPath=join(store.dir,'manifest.jsonl');
  const manifest=existsSync(manifestPath)?readFileSync(manifestPath,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];
  async function read(method:string,params:unknown[]){
    for(const m of [...manifest].reverse()){
      if(m.endpoint!==method||!m.rawRetained||m.status!==200||JSON.stringify(m.params)!==JSON.stringify(params))continue;
      const bytes=readFileSync(join(store.dir,'responses',m.id+'.body'));
      if(hash(bytes)!==m.sha256)throw new Error('CACHED_RESPONSE_HASH_MISMATCH');
      const data=lossless(bytes.toString('utf8'));
      if(!data.error&&data.result!==undefined&&data.result!==null)return {id:m.id,data:data.result};
    }
    return providers.rpc(method,params);
  }
  const verification=store.read<any[]>('verification.json')??[];
  const sample=verification.filter(x=>x.receiptStatus==='0x1').slice(0,max),out:any[]=[];
  for(const v of sample){
    const row:any={txHash:v.txHash,source:'GMGN-selected receipt sample',status:'PENDING'};
    try{
      const tx=await read('eth_getTransactionByHash',[v.txHash]);
      const trace=await read('debug_traceTransaction',[v.txHash,{tracer:'callTracer',tracerConfig:{onlyTopCall:false},timeout:'10s'}]);
      row.transactionResponseId=tx.id;row.traceResponseId=trace.id;
      const root=trace.data;
      if(tx.data.hash!==v.txHash||tx.data.blockHash!==v.blockHash||tx.data.blockNumber!==v.blockNumber||root.from?.toLowerCase()!==tx.data.from?.toLowerCase()||root.to?.toLowerCase()!==tx.data.to?.toLowerCase()||root.input!==tx.data.input||integer(root.value??'0x0')!==integer(tx.data.value)||Boolean(root.error))throw new Error('TRACE_TRANSACTION_IDENTITY_MISMATCH');
      const accounting=nativeAccounting(root,providers.config.wallet,BigInt(new Decimal(v.gasNative).mul('1e18').toFixed(0)));
      row.traceMovement=accounting.movement;row.systemTransfers=accounting.system;
      row.nativeCashflowBeforeGas=native(accounting.movement.rawDelta);
      row.receiptGasNativeChargedToWallet=native(accounting.rawGasCharged);row.nativeNetIncludingGas=native(accounting.rawNetIncludingGas);
      const state=await read('debug_traceTransaction',[v.txHash,{tracer:'prestateTracer',tracerConfig:{diffMode:true},timeout:'10s'}]);
      row.stateResponseId=state.id;row.stateBalance=stateBalanceDelta(state.data,providers.config.wallet);
      row.stateBalance.matches=accounting.rawNetIncludingGas===row.stateBalance.rawDelta;
      if(!row.stateBalance.matches)throw new Error('TRACE_STATE_BALANCE_MISMATCH');
      // A second provider's archive balances must equal BOTH transaction-level
      // boundaries. Other wallet activity in the block can make this inconclusive.
      const pre=await read('eth_getBalance',[providers.config.wallet,'0x'+(BigInt(v.blockNumber)-1n).toString(16)]);
      const post=await read('eth_getBalance',[providers.config.wallet,v.blockNumber]);
      row.archiveBalance={preResponseId:pre.id,postResponseId:post.id,preRaw:integer(pre.data).toString(),postRaw:integer(post.data).toString(),matchesStateBoundaries:integer(pre.data).toString()===row.stateBalance.preRaw&&integer(post.data).toString()===row.stateBalance.postRaw};
      row.status=row.archiveBalance.matchesStateBoundaries?'RECONCILED_TRACE_STATE_AND_ARCHIVE_BALANCES':'STATE_RECONCILED_BLOCK_BOUNDARIES_DIFFER';
      if(!row.archiveBalance.matchesStateBoundaries){
        const block=await read('eth_getBlockByNumber',[v.blockNumber,true]);
        if(block.data.hash!==v.blockHash||!Array.isArray(block.data.transactions))throw new Error('BLOCK_IDENTITY_MISMATCH');
        const related=block.data.transactions.filter((t:any)=>t.from?.toLowerCase()===providers.config.wallet||t.to?.toLowerCase()===providers.config.wallet);
        if(!related.some((t:any)=>t.hash===v.txHash)||related.length>20)throw new Error('BLOCK_RECONCILIATION_SCOPE_UNKNOWN');
        const sequence:any[]=[{txHash:v.txHash,index:tx.data.transactionIndex,...row.stateBalance}];
        row.blockReconciliation={blockResponseId:block.id,sequence,matches:false};
        for(const t of related.filter((t:any)=>t.hash!==v.txHash)){
          const receipt=await read('eth_getTransactionReceipt',[t.hash]);
          if(receipt.data.transactionHash!==t.hash||receipt.data.blockHash!==v.blockHash||!['0x0','0x1'].includes(receipt.data.status))throw new Error('RELATED_RECEIPT_IDENTITY_MISMATCH');
          const call=await read('debug_traceTransaction',[t.hash,{tracer:'callTracer',tracerConfig:{onlyTopCall:false},timeout:'10s'}]);
          if(call.data.from?.toLowerCase()!==t.from?.toLowerCase()||call.data.to?.toLowerCase()!==t.to?.toLowerCase()||call.data.input!==t.input||integer(call.data.value??'0x0')!==integer(t.value)||Boolean(call.data.error)!==(receipt.data.status==='0x0'))throw new Error('RELATED_TRACE_IDENTITY_MISMATCH');
          const extra=nativeAccounting(call.data,providers.config.wallet,integer(receipt.data.gasUsed)*integer(receipt.data.effectiveGasPrice));
          const diff=await read('debug_traceTransaction',[t.hash,{tracer:'prestateTracer',tracerConfig:{diffMode:true},timeout:'10s'}]);
          const balance=stateBalanceDelta(diff.data,providers.config.wallet);
          if(extra.rawNetIncludingGas!==balance.rawDelta)throw new Error('RELATED_TRACE_STATE_MISMATCH');
          sequence.push({txHash:t.hash,index:t.transactionIndex,selector:t.input.slice(0,10),receiptResponseId:receipt.id,traceResponseId:call.id,stateResponseId:diff.id,...balance,accounting:extra});
        }
        row.blockReconciliation.matches=balanceSequenceMatches(sequence,row.archiveBalance.preRaw,row.archiveBalance.postRaw);
        if(row.blockReconciliation.matches)row.status='RECONCILED_WITH_OTHER_WALLET_TRANSACTIONS_IN_BLOCK';
      }
      row.usd=null;row.caveat='Sampled native cashflows only; historical USD and routed token fee classification remain unvalidated. Block balances can include other transactions.';
    }catch(e){row.status='BLOCKED_OR_UNKNOWN';row.error=e instanceof Error?e.message:'TRACE_FAILED';}
    out.push(row);store.write('native-cashflow-verification.json',out);
    if(row.status==='BLOCKED_OR_UNKNOWN')break;
  }
  const reconciled=out.filter(x=>x.archiveBalance?.matchesStateBoundaries||x.blockReconciliation?.matches).length;
  return {attempted:out.length,parsed:out.filter(x=>x.traceMovement).length,stateReconciled:out.filter(x=>x.stateBalance?.matches).length,archiveReconciled:reconciled,status:out.some(x=>x.status==='BLOCKED_OR_UNKNOWN')?'BLOCKED_OR_UNKNOWN':reconciled===out.length&&out.length?'ALL_SAMPLED_NATIVE_BALANCES_RECONCILED':out.length?'SOME_BLOCK_BOUNDARIES_REQUIRE_RECONCILIATION':'NO_CASES'};
}
