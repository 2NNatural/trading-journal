import { existsSync,readFileSync } from 'node:fs';
import { durableWrite } from './store.ts';

export const SOLID_QUOTA_HEADERS=['x-quota-limit','x-quota-used','x-quota-remaining','x-quota-reset','x-quota-window'];
interface QuotaState {
  day:string;attempts:number;remaining?:number;resetAt?:number;hold?:string;
  snapshot?:Record<string,string>;
}
const uint=(x:string|undefined)=>x!==undefined&&/^\d+$/.test(x)&&Number.isSafeInteger(Number(x))?Number(x):undefined;

export class FreeQuota {
  path:string;
  constructor(path:string){this.path=path;}
  private read(now:number):QuotaState {
    const day=new Date(now).toISOString().slice(0,10);
    const state:QuotaState=existsSync(this.path)?JSON.parse(readFileSync(this.path,'utf8')):{day,attempts:0};
    if(state.day!==day){state.day=day;state.attempts=0;}
    if(state.resetAt!==undefined&&now>=state.resetAt){delete state.remaining;delete state.resetAt;}
    return state;
  }
  private save(state:QuotaState){durableWrite(this.path,JSON.stringify(state));}
  reserve(now:number){
    const state=this.read(now);
    if(state.hold)throw new Error(`FREE_QUOTA_HOLD: ${state.hold}`);
    if(state.remaining===0)throw new Error(`FREE_QUOTA_EXHAUSTED until ${state.resetAt?new Date(state.resetAt).toISOString():'provider reset is confirmed'}`);
    // Conservative per-workspace ceiling, leaving headroom below advertised 10K/day.
    // Counts attempts, including retries; other apps are covered only by server headers.
    if(state.attempts>=8000)throw new Error('FREE_LOCAL_DAILY_LIMIT: 8000 attempted calls; resume next UTC day.');
    state.attempts++;if(state.remaining!==undefined)state.remaining=Math.max(0,state.remaining-1);
    this.save(state);
  }
  observe(status:number,headers:Record<string,string>,now:number){
    const state=this.read(now);
    const snapshot=Object.fromEntries(SOLID_QUOTA_HEADERS.filter(k=>headers[k]!==undefined).map(k=>[k,headers[k]]));
    if(Object.keys(snapshot).length){
      state.snapshot=snapshot;
      const remaining=uint(headers['x-quota-remaining']),seconds=uint(headers['x-quota-reset']);
      const limit=uint(headers['x-quota-limit']);
      if((headers['x-quota-window']&&headers['x-quota-window']!=='day')||(limit!==undefined&&limit>10000))state.hold='UNEXPECTED_PLAN_QUOTA: confirm this account is Free before further calls.';
      if(remaining===undefined||seconds===undefined||seconds>366*86400)state.hold='MALFORMED_QUOTA_HEADERS: provider reset needs inspection.';
      else{state.remaining=remaining;state.resetAt=now+seconds*1000+1000;}
    }
    if(status===402){
      state.remaining=0;
      if(state.resetAt===undefined)state.hold='QUOTA_402_WITHOUT_RESET: inspect the account quota before resuming.';
    }
    this.save(state);
  }
}
