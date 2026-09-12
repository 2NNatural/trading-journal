import { randomUUID } from 'node:crypto';
import type { Config } from './config.ts';
import { Transport } from './transport.ts';

export const GMGN_READ_PATHS=new Set(['/v1/user/wallet_activity','/v1/token/info','/v1/token/pool_info','/v1/market/token_kline','/v1/token/security','/v1/market/token_top_holders','/v1/user/wallet_token_balance']);
export const RPC_READ_METHODS=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getLogs','eth_getBalance','eth_getCode','eth_getStorageAt','web3_sha3','eth_call','alchemy_getAssetTransfers','debug_traceTransaction']);
export class Providers {
  config:Config; transport:Transport;
  private checkedTraceUrl?:string;
  constructor(config:Config,transport:Transport){this.config=config;this.transport=transport;}
  async gmgn(path:string,params:Record<string,string|number>) {
    if(!GMGN_READ_PATHS.has(path))throw new Error('GMGN_ENDPOINT_PROHIBITED');
    const result=await this.transport.call(()=>{
      const url=new URL(path,'https://openapi.gmgn.ai');
      for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
      url.searchParams.set('timestamp',String(Math.floor(Date.now()/1000)));url.searchParams.set('client_id',randomUUID());
      return {url:url.href,method:'GET',headers:{'X-APIKEY':this.config.apiKey,'Content-Type':'application/json','User-Agent':'gmgn-cli/1.6.1'}};
    },{provider:'gmgn',endpoint:path,params});
    if(String(result.data?.code)!=='0')throw new Error(`GMGN_API_ERROR code=${/^[\d-]+$/.test(String(result.data?.code))?result.data.code:'unknown'}; inspect archived response.`);
    return {...result,data:result.data.data};
  }
  activity(limit=20,cursor?:string){return this.gmgn('/v1/user/wallet_activity',{chain:'robinhood',wallet_address:this.config.wallet,limit,...(cursor?{cursor}:{})});}
  async rpc(method:string,params:unknown[]=[]) {
    if(!RPC_READ_METHODS.has(method))throw new Error('RPC_METHOD_PROHIBITED');
    const rpcUrl=method==='debug_traceTransaction'?(this.config.traceRpcUrl??this.config.rpcUrl):this.config.rpcUrl;
    if(method==='debug_traceTransaction'&&this.checkedTraceUrl!==rpcUrl){
      const identity=await this.rpcAt(rpcUrl,'eth_chainId',[]);
      if(identity.data!=='0x1237')throw new Error('WRONG_TRACE_CHAIN: expected Robinhood mainnet 4663.');
      this.checkedTraceUrl=rpcUrl;
    }
    return this.rpcAt(rpcUrl,method,params);
  }
  private async rpcAt(rpcUrl:string,method:string,params:unknown[]){
    const response=await this.transport.call(()=>({url:rpcUrl,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),{provider:'rpc',endpoint:method,params});
    if(response.data.error)throw new Error(`RPC_ERROR code=${response.data.error.code??'unknown'}; response archived.`);
    return {...response,data:response.data.result};
  }
  async checkChain(){const r=await this.rpc('eth_chainId');if(r.data!=='0x1237')throw new Error('WRONG_CHAIN: expected Robinhood mainnet 4663.');return r;}
}
