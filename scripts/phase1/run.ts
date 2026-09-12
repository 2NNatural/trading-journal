import { loadConfig, redact } from './config.ts';
import { Store } from './store.ts';
import { Transport } from './transport.ts';
import { Providers } from './providers.ts';
import { page, profile } from './profile.ts';
import { parseArgs } from 'node:util';
import { history, readObservations, observationMultiset } from './paginate.ts';
import { normalize } from './normalize.ts';
import { verify } from './verify.ts';
import { discover } from './discover.ts';
import { sampleLatency } from './latency.ts';
import { report } from './report.ts';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { corpus } from './corpus.ts';
import { compatibility } from './compatibility.ts';
import { audit } from './audit.ts';
import { diagnose } from './diagnose.ts';
import { quarantine } from './quarantine.ts';
import { traceSample } from './traces.ts';
import { cliComparison } from './cli.ts';
import { freeRpcProbe } from './free-rpc.ts';

async function main(){
  const {values}=parseArgs({options:{mode:{type:'string',default:'inspect'},dir:{type:'string'},limit:{type:'string',default:'50'},'max-pages':{type:'string',default:'50'},resume:{type:'boolean',default:false},sample:{type:'string',default:'20'},seconds:{type:'string',default:'120'},token:{type:'string'},compare:{type:'string'},'cli-entry':{type:'string'}}});
  const integer=(s:string|undefined,max:number)=>{const n=Number(s);if(!Number.isInteger(n)||n<1||n>max)throw new Error('Invalid numeric option');return n;};
  const config=loadConfig(); const store=new Store(values.dir);
  console.log(`Private run directory: ${store.dir}`);
  const previous=store.read<any>('run.json');if(previous&&previous.wallet!==config.wallet)throw new Error('RUN_WALLET_MISMATCH');
  if(!previous)store.write('run.json',{startedAt:new Date().toISOString(),chainId:4663,wallet:config.wallet,cliReferenceVersion:'1.6.1'});
  store.append('commands.jsonl',{mode:values.mode,at:new Date().toISOString()});
  try {
    const lock=resolve('research/phase1/.active-run');
    mkdirSync(lock,{mode:0o700});writeFileSync(resolve(lock,'owner.json'),JSON.stringify({pid:process.pid,at:new Date().toISOString()}),{mode:0o600});
    process.once('exit',()=>rmSync(lock,{recursive:true,force:true}));
    process.once('SIGINT',()=>process.exit(130));process.once('SIGTERM',()=>process.exit(143));
    const providers=new Providers(config,new Transport(store,config.secrets));
    if(values.mode==='free-rpc'){console.log(JSON.stringify(await freeRpcProbe(providers,store)));return;}
    if(values.mode==='cli'){if(!values['cli-entry'])throw new Error('Provide --cli-entry PATH_TO_PINNED_DIST_INDEX_JS');console.log(JSON.stringify(await cliComparison(providers,store,values['cli-entry'])));return;}
    if(values.mode==='trace'){console.log(JSON.stringify(await traceSample(providers,store,integer(values.sample,20))));return;}
    if(values.mode==='quarantine'){console.log(JSON.stringify(await quarantine(providers,store)));return;}
    if(values.mode==='diagnose'){console.log(JSON.stringify(await diagnose(providers,store)));return;}
    if(values.mode==='audit'){console.log(JSON.stringify(audit(store)));return;}
    if(values.mode==='compatibility'){console.log(JSON.stringify(await compatibility(store)));return;}
    if(values.mode==='corpus'){console.log(JSON.stringify(await corpus(providers,store)));return;}
    if(values.mode==='filters'){
      const results=[];
      for(const type of ['transferIn','transferOut']){
        const r=await providers.gmgn('/v1/user/wallet_activity',{chain:'robinhood',wallet_address:config.wallet,limit:50,type});
        const p=page(r.data);p.activities.forEach((row,ordinal)=>store.append('transfer-filter-observations.jsonl',{responseId:r.id,observedAt:r.receivedAt,ordinal,row}));
        results.push({type,responseId:r.id,rows:p.activities.length,hasNext:!!p.next,kinds:[...new Set(p.activities.map((x:any)=>x.event_type))]});
      }
      store.write('transfer-filter-probes.json',results);console.log(JSON.stringify(results));return;
    }
    if(values.mode==='history'){
      const cp=await history(providers,store,integer(values.limit,100),integer(values['max-pages'],200),values.resume);
      const obs=readObservations(store);const candidates=normalize(obs);store.write('activity-candidates.json',candidates);store.write('observation-multiset.json',observationMultiset(obs));
      console.log(JSON.stringify(report(store,candidates)));return;
    }
    if(values.mode==='verify'){const candidates=normalize(readObservations(store));await verify(providers,store,candidates,integer(values.sample,30));console.log(JSON.stringify(report(store,candidates)));return;}
    if(values.mode==='discover'){const d=await discover(providers,store,integer(values['max-pages'],20));console.log(JSON.stringify({rows:d.rows,coverage:d.coverage}));return;}
    if(values.mode==='latency'){const r=await sampleLatency(providers,store,integer(values.seconds,600));console.log(JSON.stringify({polls:r.polls,N:r.N,p95Ms:r.p95Ms,gate:r.gate}));return;}
    if(values.mode==='compare'){
      if(!values.compare)throw new Error('Provide --compare RUN_DIRECTORY');const other=new Store(values.compare);
      const a=observationMultiset(readObservations(store)),b=observationMultiset(readObservations(other));
      const differences=[...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>a[k]!==b[k]);
      store.write('page-size-comparison.json',{otherRun:other.dir,differentPayloads:differences.length,differences,identical:!differences.length,caveat:'Observed payload multiset only; source revisions or new trades can cause differences. No canonical event IDs assumed.'});
      console.log(JSON.stringify({differentPayloads:differences.length,identical:!differences.length}));return;
    }
    if(values.mode==='market'){
      const token=values.token??normalize(readObservations(store)).find(c=>c.token)?.token;
      if(!token||!/^0x[\da-f]{40}$/i.test(token))throw new Error('Provide a valid --token or run history first.');
      const out:any={};
      for(const endpoint of ['/v1/token/info','/v1/token/pool_info']){try{const r=await providers.gmgn(endpoint,{chain:'robinhood',address:token});out[endpoint]={responseId:r.id,fields:profile(r.data)};}catch(e){out[endpoint]={error:e instanceof Error?e.message:'ERROR'};}}
      const to=Math.floor(Date.now()/1000)*1000,from=to-3600_000;
      try{const r=await providers.gmgn('/v1/market/token_kline',{chain:'robinhood',address:token,resolution:'1m',from,to});out.kline={responseId:r.id,fields:profile(r.data),requestedFrom:from,requestedTo:to};}catch(e){out.kline={error:e instanceof Error?e.message:'ERROR'};}
      store.write('market-capabilities.json',out);console.log('Market capability responses captured.');return;
    }
    if(values.mode!=='inspect')throw new Error('Unknown mode.');
    const result=await providers.activity();
    store.write('schema-profile.json',profile(result.data));
    const p=page(result.data);
    store.write('inspection.json',{responseId:result.id,receivedAt:result.receivedAt,rows:p.activities.length,hasNext:!!p.next,topLevelKeys:Object.keys(result.data),firstRowKeys:p.activities[0]?Object.keys(p.activities[0]):[],authenticatedData:true});
    store.write('checkpoint.json',{cursor:p.next??null,firstResponseId:result.id,complete:!p.next});
    console.log(JSON.stringify({authenticatedData:true,rows:p.activities.length,hasNext:!!p.next,firstRowKeys:p.activities[0]?Object.keys(p.activities[0]):[]}));
    await providers.checkChain();console.log('RPC mainnet identity verified.');
  }catch(e){const message=redact(e instanceof Error?e.message:'UNKNOWN_ERROR',config.secrets);store.write('failure.json',{message});console.error(message);process.exitCode=1;}
}
main().catch(()=>{console.error('Configuration or initialization failed. Verify .env.local; secrets were not printed.');process.exitCode=1;});
