import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'dotenv';

export interface Config { wallet: string; apiKey: string; rpcUrl: string; traceRpcUrl?: string; secrets: string[]; }
export function loadConfig(path = '.env.local', env = process.env): Config {
  const file = existsSync(path) ? parse(readFileSync(path)) : {};
  const value = (key: string) => (env[key] ?? file[key] ?? '').trim();
  if (value('GMGN_PRIVATE_KEY')) throw new Error('Signing credentials are prohibited in the Phase 1 runtime.');
  const wallet = value('TEST_WALLET');
  if (!/^0x[\da-f]{40}$/i.test(wallet) || /^0x0{40}$/i.test(wallet)) throw new Error('Configure a real public TEST_WALLET in .env.local.');
  const apiKey = value('GMGN_API_KEY');
  if (!apiKey) throw new Error('Configure GMGN_API_KEY in .env.local.');
  const alchemy = value('ALCHEMY_API_KEY');
  const explicit = value('ROBINHOOD_RPC_URL');
  const traceRpcUrl = value('ROBINHOOD_TRACE_RPC_URL') || undefined;
  const rpcUrl = explicit || (alchemy ? `https://robinhood-mainnet.g.alchemy.com/v2/${encodeURIComponent(alchemy)}` : 'https://rpc.mainnet.chain.robinhood.com');
  if (new URL(rpcUrl).protocol !== 'https:') throw new Error('RPC endpoint must use HTTPS.');
  if (traceRpcUrl && new URL(traceRpcUrl).protocol !== 'https:') throw new Error('Trace RPC endpoint must use HTTPS.');
  const solidKeys=[rpcUrl,traceRpcUrl].flatMap(url=>{
    if(!url)return [];
    const parsed=new URL(url);
    return parsed.hostname==='rpc.solidrpc.io'?[decodeURIComponent(parsed.pathname.split('/')[1]??'')]:[];
  });
  return { wallet: wallet.toLowerCase(), apiKey, rpcUrl, traceRpcUrl, secrets: [apiKey, alchemy, explicit, traceRpcUrl,...solidKeys].filter((x):x is string=>Boolean(x)) };
}
export function redact(text: string, secrets: string[]): string {
  for (const secret of secrets) for (const form of [secret, encodeURIComponent(secret)]) text = text.split(form).join('[REDACTED]');
  return text;
}
