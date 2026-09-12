import { request } from 'node:https';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { parse as parseLossless, isLosslessNumber } from 'lossless-json';
import { Store, hash } from './store.ts';
import { redact } from './config.ts';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { durableWrite } from './store.ts';
import { profile } from './profile.ts';
import { FreeQuota,SOLID_QUOTA_HEADERS } from './quota.ts';

export interface WireRequest { url: string; method: 'GET'|'POST'; headers: Record<string,string>; body?: string; }
export interface WireResponse { status: number; headers: Record<string,string>; body: Buffer; }
export type Sender = (req: WireRequest) => Promise<WireResponse>;
export const sendIPv4: Sender = (req) => new Promise((resolve,reject) => {
  const r=request(req.url,{method:req.method,headers:req.headers,family:4},res=>{
    const chunks: Buffer[]=[]; let total=0;
    res.on('data',(c:Buffer)=>{total+=c.length;if(total>20*1024*1024)r.destroy(new Error('RESPONSE_SIZE_LIMIT'));else chunks.push(c);});
    res.on('error',reject);
    res.on('end',()=>resolve({status:res.statusCode??0,headers:Object.fromEntries(Object.entries(res.headers).map(([k,v])=>[k,Array.isArray(v)?v.join(','):v??''])),body:Buffer.concat(chunks)}));
  });
  r.setTimeout(25_000,()=>r.destroy(new Error('REQUEST_TIMEOUT')));
  r.on('error',reject); if(req.body)r.write(req.body);r.end();
});
export function lossless(text: string): any { return parseLossless(text,undefined, (s:string)=>s); }
export function cooldownPath(provider:string,scope:string){const dir=resolve('research/phase1/.provider-state');mkdirSync(dir,{recursive:true,mode:0o700});return resolve(dir,hash(provider+'\0'+scope)+'.json');}
export const scalar = (x: unknown): string | undefined => typeof x==='string' ? x : typeof x==='number' ? String(x) : isLosslessNumber(x) ? x.value : undefined;
export function resetTime(headers: Record<string,string>, body: any, now: number): number {
  const retry=headers['retry-after'];
  const candidates=[now+5000,Number(headers['x-ratelimit-reset'])*1000,Number(body?.reset_at)*1000];
  if(retry)candidates.push(/^\d+(\.\d+)?$/.test(retry)?now+Number(retry)*1000:Date.parse(retry));
  return Math.max(...candidates.filter(Number.isFinite))+1000;
}
export class Transport {
  store: Store; secrets: string[]; sender: Sender; now: ()=>number; sleep: (ms:number)=>Promise<unknown>;
  private tail: Promise<unknown>=Promise.resolve();
  private nextAt=0;
  constructor(store:Store,secrets:string[],sender:Sender=sendIPv4, now=Date.now,sleep=(ms:number)=>delay(ms)) {Object.assign(this,{store,secrets,sender,now,sleep});this.store=store;this.secrets=secrets;this.sender=sender;this.now=now;this.sleep=sleep;}
  call(make:()=>WireRequest,meta:{provider:string; endpoint:string; params?:unknown}):Promise<{id:string;data:any;status:number;receivedAt:string;headers:Record<string,string>}> {
    const job=this.tail.then(()=>this.perform(make,meta));this.tail=job.catch(()=>{});return job;
  }
  private async perform(make:()=>WireRequest,meta:{provider:string;endpoint:string;params?:unknown}) {
    const identity=make();
    const scope=meta.provider==='gmgn'?(identity.headers['X-APIKEY']??this.secrets[0]??'anonymous'):identity.url;
    const statePath=cooldownPath(meta.provider,scope);
    const quota=new URL(identity.url).hostname==='rpc.solidrpc.io'?new FreeQuota(statePath+'.quota.json'):undefined;
    const cooldown:Record<string,number>=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{};
    if(cooldown.manualReviewRequired)throw new Error('PROVIDER_HOLD: CLI rate-limit reset was unavailable; inspect captured stderr and provider state before resuming.');
    const waitUntil=Math.max(this.nextAt,cooldown[meta.provider]??0);
    if(waitUntil-this.now()>30_000)throw new Error(`PROVIDER_COOLDOWN until ${new Date(waitUntil).toISOString()}; rerun after cooldown.`);
    if(waitUntil>this.now())await this.sleep(waitUntil-this.now());
    for(let attempt=0;attempt<3;attempt++) {
      if(this.nextAt>this.now())await this.sleep(this.nextAt-this.now());
      this.nextAt=this.now()+1000; // conservative one request/sec, shared by jobs
      quota?.reserve(this.now());
      const id=randomUUID(),start=this.now(); let response:WireResponse;
      try { response=await this.sender(make()); }
      catch(e) {
        this.store.append('manifest.jsonl',{id,...meta,requestedAt:new Date(start).toISOString(),networkError:redact(e instanceof Error?e.message:'NETWORK_ERROR',this.secrets)});
        if(attempt===2)throw new Error('NETWORK_ERROR: read request failed; see private run manifest.');
        await this.sleep(1000*2**attempt); continue;
      }
      const receivedAt=new Date(this.now()).toISOString(),text=response.body.toString('utf8');
      const sensitive=redact(text,this.secrets)!==text;
      const headers=Object.fromEntries(Object.entries(response.headers).filter(([k])=>['date','content-type','retry-after','x-ratelimit-reset','x-ratelimit-limit','x-ratelimit-remaining',...SOLID_QUOTA_HEADERS].includes(k)).map(([k,v])=>[k,redact(v,this.secrets)]));
      // Reflected credentials are not allowed into source archives. Never advance checkpoint on suppression.
      this.store.body(id,sensitive?Buffer.from('[BODY SUPPRESSED: REFLECTED CREDENTIAL]'):response.body);
      this.store.append('manifest.jsonl',{id,...meta,url:meta.provider==='gmgn'?'https://openapi.gmgn.ai'+meta.endpoint:'[configured RPC endpoint]',requestedAt:new Date(start).toISOString(),receivedAt,latencyMs:this.now()-start,status:response.status,headers,bytes:response.body.length,sha256:hash(response.body),rawRetained:!sensitive,transport:'HTTPS IPv4',attempt:attempt+1});
      if(sensitive)throw new Error('SECRET_REFLECTION: body suppressed; checkpoint unchanged.');
      quota?.observe(response.status,headers,this.now());
      // Wire types are profiled separately; numerical values used below remain exact strings.
      try{this.store.write(`responses/${id}.schema.json`,profile(JSON.parse(text)));}catch{/* invalid JSON is handled below */}
      let data:any;try {data=lossless(text);}catch {data=undefined;}
      if(response.status===429 || String(data?.code)==='429') {
        cooldown[meta.provider]=resetTime(headers,data,this.now());durableWrite(statePath,JSON.stringify(cooldown));this.store.write('cooldowns.json',cooldown);
        throw new Error(`RATE_LIMITED until ${new Date(cooldown[meta.provider]).toISOString()}; no requests during cooldown.`);
      }
      if(response.status>=500&&attempt<2){await this.sleep(1000*2**attempt);continue;}
      if(response.status<200||response.status>=300)throw new Error(`HTTP_${response.status}: ${meta.provider} ${meta.endpoint}; response archived.`);
      if(data===undefined)throw new Error('NON_JSON_RESPONSE: response archived.');
      return {id,data,status:response.status,receivedAt,headers};
    }
    throw new Error('RETRY_EXHAUSTED');
  }
}
