// Research-only assertions against archived official code. NO live network calls.
import assert from 'node:assert/strict';
import {validateChain,validateAddress} from './sources/cli-1.6.1/dist/validate.js';
import {sanitizeForOutputWithCount} from './sources/cli-1.6.1/dist/sanitize.js';
import {OpenApiClient} from './sources/cli-1.6.1/dist/client/OpenApiClient.js';
validateChain('robinhood');
validateAddress('0x0000000000000000000000000000000000000000','robinhood','--wallet');
let sent;
globalThis.fetch=async(url,options)=>{
 sent={url,method:options.method,headerNames:Object.keys(options.headers)};
 assert.equal(options.headers['X-APIKEY'],'SYNTHETIC_TEST_ONLY');
 assert.equal(options.headers['X-Signature'],undefined);
 return new Response(JSON.stringify({code:0,data:{activities:[],next:null}}),{status:200});
};
const client=new OpenApiClient({apiKey:'SYNTHETIC_TEST_ONLY',host:'https://openapi.gmgn.ai'});
const result=await client.getWalletActivity('robinhood','0x0000000000000000000000000000000000000000',{limit:1});
assert.equal(new URL(sent.url).pathname,'/v1/user/wallet_activity');
assert.equal(new URL(sent.url).searchParams.get('chain'),'robinhood');
assert.equal(sent.method,'GET');
assert.deepEqual(result,{activities:[],next:null});
const changed=sanitizeForOutputWithCount({token:{symbol:'T\u200bEST'}});
assert.deepEqual(changed,{data:{token:{symbol:'TEST'}},changed:1});
console.log(JSON.stringify({type:'LOCAL_SYNTHETIC_MOCKED_TRANSPORT',version:'1.6.1',chain_validation:'PASS',unsigned_activity_construction:'PASS',envelope_unwrap:'PASS',sanitization:'PASS'},null,2));
// Additional version-specific observation: async error escapes documented retry.
let rateCalls=0;
globalThis.fetch=async()=>{
 rateCalls++;
 return new Response(JSON.stringify({code:429,error:'RATE_LIMIT_EXCEEDED',message:'synthetic offline test'}),{status:429,headers:{'X-RateLimit-Reset':String(Math.floor(Date.now()/1000)+1)}});
};
await assert.rejects(client.getWalletActivity('robinhood','0x0000000000000000000000000000000000000000'),/RATE_LIMIT_EXCEEDED/);
assert.equal(rateCalls,1);
console.log(JSON.stringify({type:'LOCAL_SYNTHETIC_MOCKED_TRANSPORT',version:'1.6.1',short_cooldown_429_fetch_calls:rateCalls,automatic_retry_observed:false}));
