import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store, hash } from './store.ts';
import { page, profile } from './profile.ts';
import type { Providers } from './providers.ts';

export interface HistoryCheckpoint { limit:number;cursor:string|null;pages:number;done:boolean;seenCursors:string[];seenPages:string[];stopReason?:string; }
export async function history(provider: Pick<Providers,'activity'>,store:Store,limit:number,maxPages:number,resume=false) {
  const saved=store.read<HistoryCheckpoint>('history-checkpoint.json');
  if(saved&&!resume)throw new Error('EXISTING_HISTORY: use resume or a new run directory.');
  if(saved&&saved.limit!==limit)throw new Error('RESUME_LIMIT_MISMATCH');
  const cp:HistoryCheckpoint=saved??{limit,cursor:null,pages:0,done:false,seenCursors:[],seenPages:[]};
  if(cp.done)return cp;
  delete cp.stopReason;
  for(let count=0;count<maxPages;count++){
    const r=await provider.activity(limit,cp.cursor??undefined);const p=page(r.data);
    // Rows are observations, never silently deduplicated into supposed fills.
    p.activities.forEach((row,ordinal)=>store.append('activity-observations.jsonl',{responseId:r.id,observedAt:r.receivedAt,ordinal,row}));
    store.write('schema-profile-latest.json',profile(r.data));
    const pageHash=hash(JSON.stringify(p.activities));
    const loop=!!p.next&&(p.next===cp.cursor||cp.seenCursors.includes(p.next));
    const noProgress=!!p.next&&cp.seenPages.includes(pageHash)&&p.activities.length>0;
    cp.pages++;cp.cursor=p.next??null;cp.done=!p.next;
    if(p.next)cp.seenCursors.push(p.next);cp.seenPages.push(pageHash);
    if(loop||noProgress) {cp.done=false;cp.stopReason=loop?'CURSOR_LOOP':'REPEATED_PAGE';}
    store.write('history-checkpoint.json',cp);
    if(cp.done||cp.stopReason) return cp;
  }
  cp.stopReason='PAGE_BUDGET_EXHAUSTED';store.write('history-checkpoint.json',cp);return cp;
}
export function readObservations(store:Store):any[]{
  try{return readFileSync(join(store.dir,'activity-observations.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
}
export function observationMultiset(observations:any[]) {
  // Maximum simultaneous row multiplicity per source page. This is an observation
  // comparison, not a universal economic identifier; cross-page ambiguity remains.
  const byResponse=new Map<string,Map<string,number>>();
  for(const o of observations){const m=byResponse.get(o.responseId)??new Map();const k=hash(JSON.stringify(o.row));m.set(k,(m.get(k)??0)+1);byResponse.set(o.responseId,m);}
  const result:Record<string,number>={};
  for(const m of byResponse.values())for(const [k,n]of m)result[k]=Math.max(result[k]??0,n);
  return result;
}
