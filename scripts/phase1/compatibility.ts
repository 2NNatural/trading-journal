import { readFileSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Store,durableWrite,hash } from './store.ts';

// Offline compatibility replay through the pinned official client/output modules.
// Never imports vendor config or loads global signing configuration.
export async function compatibility(store:Store){
  const manifest=readFileSync(join(store.dir,'manifest.jsonl'),'utf8').trim().split('\n').map(x=>JSON.parse(x));
  const source=manifest.find(x=>x.endpoint==='/v1/user/wallet_activity'&&x.status===200);
  if(!source)throw new Error('No captured activity response.');
  const bytes=readFileSync(join(store.dir,'responses',source.id+'.body'));
  const base=resolve('research/sources/cli-1.6.1');
  const {OpenApiClient}=await import(pathToFileURL(join(base,'dist/client/OpenApiClient.js')).href);
  const {printResult}=await import(pathToFileURL(join(base,'dist/output.js')).href);
  const oldFetch=globalThis.fetch,oldLog=console.log,oldError=console.error;const stdout:string[]=[],stderr:string[]=[];
  let calls=0;
  try{
    if(process.env.GMGN_DISABLE_OUTPUT_SANITIZE)throw new Error('Output sanitization must remain enabled.');
    globalThis.fetch=async(input,init)=>{
      const url=new URL(String(input));
      if(url.origin!=='https://openapi.gmgn.ai'||url.pathname!=='/v1/user/wallet_activity'||init?.method!=='GET')throw new Error('REPLAY_ENDPOINT_PROHIBITED');
      if(new Headers(init.headers).has('X-Signature'))throw new Error('SIGNING_PROHIBITED');
      calls++;return new Response(bytes,{status:200,headers:{'Content-Type':'application/json'}});
    };
    console.log=(...x)=>stdout.push(x.join(' '));console.error=(...x)=>stderr.push(x.join(' '));
    const client=new OpenApiClient({apiKey:'offline-replay-only',host:'https://openapi.gmgn.ai'});
    printResult(await client.getWalletActivity('robinhood',store.read<any>('run.json').wallet,{limit:source.params.limit}),true);
  }finally{globalThis.fetch=oldFetch;console.log=oldLog;console.error=oldError;}
  durableWrite(join(store.dir,'cli-replay.stdout.json'),stdout.join('\n')+'\n');durableWrite(join(store.dir,'cli-replay.stderr.txt'),stderr.join('\n'));
  const result={mode:'OFFLINE_REPLAY_OF_REAL_HTTP_BODY',cliVersion:'1.6.1',fullCliProcessExecuted:false,networkCalls:0,replayedRequests:calls,sourceResponseId:source.id,originalSha256:hash(bytes),stdoutSha256:hash(stdout.join('\n')+'\n'),sameBytes:bytes.equals(Buffer.from(stdout.join('\n')+'\n')),caveat:'Exercises official activity client and --raw output transformation with captured data. Full CLI entrypoint/config behavior is not validated.'};
  store.write('cli-compatibility.json',result);return result;
}
