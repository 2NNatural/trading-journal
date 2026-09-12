import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Store } from './store.ts';
import { Transport,cooldownPath } from './transport.ts';
import { FreeQuota } from './quota.ts';

test('quota reset is a duration; exhausted quota survives a new run and never resends early',async()=>{
  const first=new Store(resolve('research/phase1','test-'+randomUUID())),second=new Store(resolve('research/phase1','test-'+randomUUID()));
  const url='https://rpc.solidrpc.io/test-'+randomUUID()+'/evm/4663';
  let now=Date.UTC(2026,8,11,12),sent=0;
  const sender:any=async()=>{sent++;return {status:200,headers:{'x-quota-remaining':'0','x-quota-reset':'60','x-quota-limit':'10000','x-quota-window':'day'},body:Buffer.from('{"result":"0x1237"}')}};
  const req=()=>({url,method:'POST' as const,headers:{},body:'{}'}),meta={provider:'rpc',endpoint:'eth_chainId'};
  const transport=(s:Store)=>new Transport(s,[],sender,()=>now,async(ms)=>{now+=ms;});
  try{
    await transport(first).call(req,meta);
    await assert.rejects(transport(second).call(req,meta),/FREE_QUOTA_EXHAUSTED/);assert.equal(sent,1);
    now+=60_000;await assert.rejects(transport(second).call(req,meta),/FREE_QUOTA_EXHAUSTED/);
    now+=1000;await transport(second).call(req,meta);assert.equal(sent,2);
    const manifest=readFileSync(resolve(first.dir,'manifest.jsonl'),'utf8');assert.match(manifest,/x-quota-reset/);
  }finally{rmSync(first.dir,{recursive:true,force:true});rmSync(second.dir,{recursive:true,force:true});rmSync(cooldownPath('rpc',url)+'.quota.json',{force:true});}
});
test('402 is captured once, never retried, and unknown reset places a persistent hold',async()=>{
  const store=new Store(resolve('research/phase1','test-'+randomUUID()));const url='https://rpc.solidrpc.io/test-'+randomUUID()+'/evm/4663';let sent=0;
  const t=new Transport(store,[],async()=>{sent++;return {status:402,headers:{},body:Buffer.from('{"code":"QUOTA_EXCEEDED"}')}});
  const req=()=>({url,method:'POST' as const,headers:{},body:'{}'}),meta={provider:'rpc',endpoint:'eth_chainId'};
  try{await assert.rejects(t.call(req,meta),/HTTP_402/);await assert.rejects(t.call(req,meta),/FREE_QUOTA_HOLD/);assert.equal(sent,1);}
  finally{rmSync(store.dir,{recursive:true,force:true});rmSync(cooldownPath('rpc',url)+'.quota.json',{force:true});}
});
test('nonfree quota shape fails closed and the local ceiling persists',()=>{
  const store=new Store(resolve('research/phase1','test-'+randomUUID())),path=resolve(store.dir,'quota.json'),q=new FreeQuota(path),now=Date.UTC(2026,8,11);
  try{
    q.observe(200,{'x-quota-remaining':'90000','x-quota-reset':'3600','x-quota-limit':'100000','x-quota-window':'month'},now);
    assert.throws(()=>q.reserve(now),/UNEXPECTED_PLAN_QUOTA/);
    store.write('quota.json',{day:'2026-09-11',attempts:8000});assert.throws(()=>q.reserve(now),/FREE_LOCAL_DAILY_LIMIT/);
    q.reserve(now+86400_000);
    assert.equal(JSON.parse(readFileSync(path,'utf8')).attempts,1);
  }finally{rmSync(store.dir,{recursive:true,force:true});}
});
