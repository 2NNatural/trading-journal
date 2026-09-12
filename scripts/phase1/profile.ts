export function profile(value:unknown) {
  const fields:Record<string,{count:number;types:Record<string,number>}>=Object.create(null);
  function visit(x:unknown,path:string){
    const type=x===null?'null':Array.isArray(x)?'array':typeof x;
    const f=fields[path]??={count:0,types:{}};f.count++;f.types[type]=(f.types[type]??0)+1;
    if(Array.isArray(x))x.forEach(v=>visit(v,path+'[]'));
    else if(x&&typeof x==='object')Object.entries(x).forEach(([k,v])=>visit(v,path+'.'+k));
  }
  visit(value,'$');return fields;
}
export function page(data:any):{activities:any[];next?:string} {
  if(!data||!Array.isArray(data.activities))throw new Error('SCHEMA_UNKNOWN: expected activities array; inspect raw body before adapting.');
  if(data.next!==undefined&&data.next!==null&&typeof data.next!=='string')throw new Error('SCHEMA_UNKNOWN: unexpected cursor type.');
  return {activities:data.activities,next:data.next||undefined};
}
