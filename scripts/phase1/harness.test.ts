import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Store } from './store.ts';
import { Transport, lossless } from './transport.ts';
import { history, readObservations, observationMultiset } from './paginate.ts';
import { movements, TRANSFER, quantityComparison } from './verify.ts';
import { loadConfig, redact } from './config.ts';
import { Providers } from './providers.ts';
import { normalize } from './normalize.ts';
import { verify } from './verify.ts';
import { page } from './profile.ts';
import { csvCell } from './report.ts';
import { nativeMovements } from './traces.ts';

const temp=()=>new Store(resolve('research/phase1','test-'+randomUUID()));
test('wire numbers retain decimals beyond JS precision',()=>{
  assert.equal(lossless('{"n":900719925474099312345,"q":0.123456789012345678}').n,'900719925474099312345');
  assert.equal(lossless('{"q":0.123456789012345678}').q,'0.123456789012345678');
  assert.equal(quantityComparison('0.123456789012345678','123456789012345678',18).status,'EXACT');
});
test('resume survives a request failure and retains duplicate row multiplicity',async()=>{
  const store=temp();let fail=true;
  const provider:any={activity:async(_limit:number,cursor?:string)=>{
    if(cursor&&fail)throw new Error('network failure');
    return {id:cursor?'page2':'page1',receivedAt:'2026-01-01T00:00:00Z',data:{activities:cursor?[{tx:'b'}]:[{tx:'a'},{tx:'a'}],next:cursor?null:'next'}};
  }};
  try{
    await assert.rejects(history(provider,store,20,10),/network failure/);
    assert.equal(store.read<any>('history-checkpoint.json').cursor,'next');fail=false;
    assert.equal((await history(provider,store,20,10,true)).done,true);
    assert.equal(readObservations(store).length,3);
    assert.deepEqual(Object.values(observationMultiset(readObservations(store))).sort(),[1,2]);
  }finally{rmSync(store.dir,{recursive:true,force:true});}
});
test('cursor loops stop without claiming completeness',async()=>{
  const store=temp();let i=0;
  try{const cp=await history({activity:async()=>({id:String(i++),receivedAt:'now',data:{activities:[{n:i}],next:'same'}})} as any,store,20,10);assert.equal(cp.done,false);assert.equal(cp.stopReason,'CURSOR_LOOP');}
  finally{rmSync(store.dir,{recursive:true,force:true});}
});
test('429 persists across runs; reflected secrets never enter archives',async()=>{
  const store=temp(),second=temp(),secret='test-secret-'+randomUUID();let sent=0;const now=Date.now();
  const sender:any=async()=>{sent++;return {status:429,headers:{'retry-after':'60'},body:Buffer.from('{"code":429}')}};
  const req=()=>({url:'https://example.test',method:'GET' as const,headers:{}});
  try{
    await assert.rejects(new Transport(store,[secret],sender,()=>now,async()=>{}).call(req,{provider:'gmgn',endpoint:'/read'}),/RATE_LIMITED/);
    await assert.rejects(new Transport(second,[secret],sender,()=>now,async()=>{}).call(req,{provider:'gmgn',endpoint:'/read'}),/PROVIDER_COOLDOWN/);assert.equal(sent,1);
    const reflected=new Transport(second,[secret],async()=>({status:200,headers:{},body:Buffer.from(JSON.stringify({echo:secret}))}));
    await assert.rejects(reflected.call(req,{provider:'other',endpoint:'/read'}),/SECRET_REFLECTION/);
    for(const name of readdirSync(resolve(second.dir,'responses')))assert.ok(!readFileSync(resolve(second.dir,'responses',name),'utf8').includes(secret));
  }finally{rmSync(store.dir,{recursive:true,force:true});rmSync(second.dir,{recursive:true,force:true});}
});
test('receipt movements net incoming/outgoing exactly and exclude unrelated logs',()=>{
  const wallet='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),token='0x'+'3'.repeat(40);
  const topic=(s:string)=>'0x'+s.slice(2).padStart(64,'0');
  const log=(from:string,to:string,n:bigint)=>({address:token,topics:[TRANSFER,topic(from),topic(to)],data:'0x'+n.toString(16).padStart(64,'0')});
  assert.deepEqual(movements({logs:[log(other,wallet,900719925474099312345n),log(wallet,other,1n),log(other,other,4n)]},wallet),{[token]:'900719925474099312344'});
});
test('signing credentials rejected and URL-encoded secrets redacted',()=>{
  assert.throws(()=>loadConfig('/nonexistent',{GMGN_PRIVATE_KEY:'forbidden'}),/Signing/);
  assert.equal(redact('a%2Fb a/b',['a/b']),'[REDACTED] [REDACTED]');
  const config=loadConfig('/nonexistent',{TEST_WALLET:'0x'+'1'.repeat(40),GMGN_API_KEY:'gmgn-test',ROBINHOOD_TRACE_RPC_URL:'https://rpc.solidrpc.io/solid-secret/evm/4663'});
  assert.equal(redact('key=solid-secret',config.secrets),'key=[REDACTED]');
});
test('provider boundary blocks transaction submission and signed endpoints',async()=>{
  const store=temp();const provider=new Providers({wallet:'0x'+'1'.repeat(40),apiKey:'test',rpcUrl:'https://example.test',secrets:[]},new Transport(store,[],async()=>{throw new Error('must not send')}));
  try{await assert.rejects(provider.rpc('eth_sendRawTransaction',[]),/PROHIBITED/);await assert.rejects(provider.gmgn('/v1/trade/swap',{}),/PROHIBITED/);await assert.rejects(provider.gmgn('/v1/user/wallet_holdings',{}),/PROHIBITED/);}
  finally{rmSync(store.dir,{recursive:true,force:true});}
});
test('empty continuable pages do not truncate history; malformed data fails',async()=>{
  const store=temp();let i=0;
  try{const cp=await history({activity:async()=>({id:String(i++),receivedAt:'now',data:{activities:[],next:i===1?'continue':null}})} as any,store,20,5);assert.equal(cp.done,true);assert.equal(cp.pages,2);assert.throws(()=>page({list:[]}),/SCHEMA_UNKNOWN/);}
  finally{rmSync(store.dir,{recursive:true,force:true});}
});
test('same transaction can have multiple legs, revisions and unknown economic kinds',()=>{
  const base={tx_hash:'0x'+'a'.repeat(64),token:{address:'0x'+'b'.repeat(40)},token_amount:'1',event_type:'buy'};
  const obs=[base,{...base,token_amount:'2'},{...base,event_type:'transfer_in'},{...base,event_type:'add'}].map((row,ordinal)=>({responseId:'r',ordinal,row}));
  const c=normalize(obs);assert.equal(c.length,4);assert.equal(c[2].side,'transferIn');assert.ok(c[3].issues.includes('UNMAPPED_ACTIVITY_KIND'));assert.ok(c[0].issues.includes('MULTIPLICITY_OR_REVISION_REQUIRES_CHAIN_RESOLUTION'));assert.ok(c.every(x=>x.reportedUsd===null));
  assert.deepEqual(normalize(obs),c);assert.equal(csvCell('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');
});
test('failed receipts retain gas and cannot create a successful fill',async()=>{
  const store=temp();const candidate=normalize([{responseId:'r',ordinal:0,row:{tx_hash:'0x'+'a'.repeat(64),token:{address:'0x'+'b'.repeat(40)},token_amount:'1',event_type:'buy'}}]);
  const provider:any={checkChain:async()=>{},rpc:async(method:string)=>({data:method==='eth_getTransactionReceipt'?{status:'0x0',blockNumber:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x1',logs:[]}:{timestamp:'0x1'}})};
  try{const result=await verify(provider,store,candidate);assert.equal(result[0].successfulFillEligible,false);assert.equal(result[0].gasNative,'0.000000000000021');}
  finally{rmSync(store.dir,{recursive:true,force:true});}
});
test('5xx retries and malformed response capture preserve exact bytes',async()=>{
  const store=temp();let calls=0,now=Date.now();const expected=Buffer.from('<html>upstream unavailable\n');
  const transport=new Transport(store,[],async()=>({status:++calls===1?503:200,headers:{},body:expected}),()=>now,async(ms)=>{now+=ms;});
  try{
    await assert.rejects(transport.call(()=>({url:'https://example.test',method:'GET',headers:{}}),{provider:'retry-test',endpoint:'/read'}),/NON_JSON_RESPONSE/);
    assert.equal(calls,2);const bodies=readdirSync(resolve(store.dir,'responses')).filter(x=>x.endsWith('.body'));assert.equal(bodies.length,2);
    for(const file of bodies)assert.deepEqual(readFileSync(resolve(store.dir,'responses',file)),expected);
  }finally{rmSync(store.dir,{recursive:true,force:true});}
});
test('native trace accounting excludes delegate value and reverted ancestry',()=>{
  const w='0x'+'1'.repeat(40),r='0x'+'2'.repeat(40),p='0x'+'3'.repeat(40);
  const root={type:'CALL',from:w,to:r,value:'0x64',calls:[
    {type:'DELEGATECALL',from:r,to:p,value:'0x64'},
    {type:'CALL',from:r,to:w,value:'0xa'},
    {type:'CALL',from:r,to:p,value:'0x5',error:'reverted',calls:[{type:'CALL',from:p,to:w,value:'0x32'}]},
    {type:'CALL',from:w,to:w,value:'0x7'}]};
  assert.equal(nativeMovements(root,w).rawDelta,'-90');
  assert.equal(nativeMovements({...root,error:'reverted'},w).rawDelta,'0');
  assert.throws(()=>nativeMovements({...root,beforeEVMTransfers:[{value:'0x1'}]},w),/SYSTEM_TRANSFERS_REQUIRE/);
  assert.throws(()=>nativeMovements({...root,type:'UNKNOWN'},w),/TRACE_CALL_TYPE_UNKNOWN/);
});
test('trace endpoint is separate, chain-checked, and receives no GMGN API key',async()=>{
  const store=temp();let now=Date.now();const requests:any[]=[];
  const transport=new Transport(store,[],async req=>{requests.push(req);const method=JSON.parse(req.body!).method;return {status:200,headers:{},body:Buffer.from(JSON.stringify({jsonrpc:'2.0',id:1,result:method==='eth_chainId'?'0x1237':{}}))};},()=>now,async(ms)=>{now+=ms;});
  const p=new Providers({wallet:'0x'+'1'.repeat(40),apiKey:'not-for-rpc',rpcUrl:'https://primary.example',traceRpcUrl:'https://trace.example',secrets:[]},transport);
  try{
    await p.rpc('alchemy_getAssetTransfers',[{}]);await p.rpc('debug_traceTransaction',['0x'+'a'.repeat(64),{tracer:'callTracer'}]);
    assert.deepEqual(requests.map(x=>x.url),['https://primary.example','https://trace.example','https://trace.example']);
    assert.equal(JSON.parse(requests[1].body).method,'eth_chainId');assert.ok(requests.every(x=>!x.headers['X-APIKEY']));
    const wrong=new Providers({...p.config,traceRpcUrl:'https://wrong.example'},new Transport(store,[],async()=>({status:200,headers:{},body:Buffer.from('{"result":"0x1"}')})));
    await assert.rejects(wrong.rpc('debug_traceTransaction',[]),/WRONG_TRACE_CHAIN/);
  }finally{rmSync(store.dir,{recursive:true,force:true});}
});
