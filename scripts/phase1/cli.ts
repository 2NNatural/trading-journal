import { spawn } from 'node:child_process';
import { existsSync,readFileSync,mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname,join,resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Store,durableWrite,hash } from './store.ts';
import { redact } from './config.ts';
import type { Providers } from './providers.ts';
import { normalize } from './normalize.ts';
import { cooldownPath } from './transport.ts';

export async function cliComparison(providers:Providers,store:Store,entry:string){
  const statePath=cooldownPath('gmgn',providers.config.apiKey);
  const cooldown:Record<string,number>=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{};
  if(cooldown.manualReviewRequired||(cooldown.gmgn??0)>Date.now())throw new Error('CLI_PROVIDER_COOLDOWN: wait for the shared cooldown or inspect the provider hold.');
  entry=resolve(entry);
  const root=dirname(dirname(entry));const modules=dirname(root);
  const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  if(pkg.name!=='gmgn-cli'||pkg.version!=='1.6.1')throw new Error('CLI_PIN_MISMATCH');
  for(const file of ['dist/client/OpenApiClient.js','dist/commands/portfolio.js','dist/output.js','dist/sanitize.js']){
    if(hash(readFileSync(join(root,file)))!==hash(readFileSync(resolve('research/sources/cli-1.6.1',file))))throw new Error('CLI_SOURCE_MISMATCH');
  }
  const globalEnv=join(homedir(),'.config/gmgn/.env');
  if(existsSync(globalEnv))throw new Error('CLI_GLOBAL_CONFIG_PRESENT: use offline compatibility mode; existing credential files must not be loaded.');
  const cwd=join(store.dir,'cli-empty-working-directory');mkdirSync(cwd,{mode:0o700});
  // Only the API key is passed. No inherited NODE_OPTIONS, private key, proxies,
  // project .env or filesystem access to keypair.pem. Vendor config probes its
  // absent global .env; access to the generated key pair stays denied.
  const env={PATH:process.env.PATH??'',LANG:'C',GMGN_API_KEY:providers.config.apiKey};
  const args=['--permission',`--allow-fs-read=${modules}`,`--allow-fs-read=${cwd}`,`--allow-fs-read=${globalEnv}`,entry,'portfolio','activity','--chain','robinhood','--wallet',providers.config.wallet,'--limit','20','--raw'];
  const captured=await new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
    const child=spawn(process.execPath,args,{cwd,env,stdio:['ignore','pipe','pipe']});
    const stdout:Buffer[]=[],stderr:Buffer[]=[];let size=0,limited=false;
    const timer=setTimeout(()=>{limited=true;child.kill('SIGTERM');},30_000);
    for(const [stream,buffers]of [[child.stdout,stdout],[child.stderr,stderr]] as const)stream.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>20*1024*1024){limited=true;child.kill('SIGTERM');}else buffers.push(chunk);});
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.once('close',code=>{clearTimeout(timer);resolve({code:limited?-1:code,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')});});
  });
  const stdout=redact(captured.stdout,providers.config.secrets),stderr=redact(captured.stderr,providers.config.secrets);
  if(/429|rate limit|temporary block/i.test(stderr)){
    const remaining=stderr.match(/~(\d+)s remaining/);
    if(remaining)cooldown.gmgn=Date.now()+(Number(remaining[1])+2)*1000;
    else cooldown.manualReviewRequired=1;
    durableWrite(statePath,JSON.stringify(cooldown));
  }
  durableWrite(join(store.dir,'cli-live.stdout.json'),stdout);durableWrite(join(store.dir,'cli-live.stderr.txt'),stderr);
  const result:any={mode:'LIVE_PINNED_CLI_PROCESS',cliVersion:pkg.version,exitCode:captured.code,entry,globalConfigAbsentAtLaunch:true,privateKeyEnvironmentPresent:false,keypairFilesystemAccess:false,stdoutSha256:hash(stdout),stderrSha256:hash(stderr)};
  store.write('cli-live-comparison.json',result);
  if(captured.code!==0){result.status='CLI_FAILED_SEE_CAPTURE';store.write('cli-live-comparison.json',result);return result;}
  await delay(1100);
  const direct=await providers.activity(20);const cli=JSON.parse(stdout);
  if(!Array.isArray(cli.activities))throw new Error('CLI_OUTPUT_SCHEMA_UNKNOWN');
  const transform=(rows:any[])=>normalize(rows.map((row,ordinal)=>({responseId:'compare',ordinal,row}))).map(({observationKey,sourceRefs,...x})=>JSON.stringify(x)).sort();
  result.directResponseId=direct.id;result.cliRows=cli.activities.length;result.directRows=direct.data.activities.length;
  result.normalizedFieldsEqual=JSON.stringify(transform(cli.activities))===JSON.stringify(transform(direct.data.activities));
  result.status=result.normalizedFieldsEqual?'MATCHED_AT_CAPTURE':'DIFFERENCE_REQUIRES_INSPECTION';
  result.caveat='Sequential head requests, not an atomic provider snapshot. CLI numerical parsing and safe output transformations can differ from exact HTTP values. Original HTTP response is captured by the direct request.';
  store.write('cli-live-comparison.json',result);return result;
}
