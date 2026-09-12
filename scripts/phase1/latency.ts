import { setTimeout as delay } from 'node:timers/promises';
import type { Providers } from './providers.ts';
import { Store,hash } from './store.ts';
import { page } from './profile.ts';
export async function sampleLatency(providers:Providers,store:Store,seconds:number,interval=10){
  const start=Date.now(),end=start+seconds*1000;const seen=new Set<string>();const events:any[]=[];
  let baseline=true,lastPoll:string|null=null,polls=0;
  while(Date.now()<end){
    const r=await providers.activity(50);const p=page(r.data);polls++;
    for(const row of p.activities){
      const k=hash(JSON.stringify([row.tx_hash,row.token?.address,row.event_type]));if(seen.has(k))continue;seen.add(k);
      if(!baseline)events.push({txHash:row.tx_hash,providerTimestamp:row.timestamp,firstPresentAt:r.receivedAt,lastAbsentPoll:lastPoll,providerTimestampToObservedMs:Date.parse(r.receivedAt)-Number(row.timestamp)*1000,
        caveat:'Transaction/token/side observations, not canonical event IDs; multiple fills may collapse. Last-absence requires head-page coverage. Chain execution time and RPC first observation remain unverified.'});
    }
    baseline=false;lastPoll=r.receivedAt;
    store.write('latency.json',{startedAt:new Date(start).toISOString(),polls,events,completed:false,intervalSeconds:interval,coverage:'HEAD_PAGE_ONLY',rpcFirstObservation:'NOT_MEASURED',sessionsObserved:1});
    const remaining=end-Date.now();if(remaining>0)await delay(Math.min(remaining,interval*1000+Math.floor(Math.random()*1000)));
  }
  const lags=events.map(x=>x.providerTimestampToObservedMs).filter(x=>x>=0).sort((a,b)=>a-b);
  const percentile=(q:number)=>lags.length?lags[Math.max(0,Math.ceil(lags.length*q)-1)]:null;
  const report={startedAt:new Date(start).toISOString(),polls,events,completed:true,intervalSeconds:interval,N:events.length,p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:percentile(1),
    gate:'PENDING_REQUIRES_20_ACTIONS_TWO_PERIODS_AND_RPC_OBSERVATION',coverage:'HEAD_PAGE_ONLY',rpcFirstObservation:'NOT_MEASURED',sessionsObserved:1};
  store.write('latency.json',report);return report;
}
