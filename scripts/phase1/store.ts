import { mkdirSync, openSync, closeSync, writeFileSync, fsyncSync, renameSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
export const hash = (x: string | Buffer) => createHash('sha256').update(x).digest('hex');
export function durableWrite(path: string, data: string | Buffer): void {
  const temp = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temp, 'wx', 0o600);
  try { writeFileSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, path);
  const parent=openSync(dirname(path),'r');try{fsyncSync(parent);}finally{closeSync(parent);}
}
export class Store {
  dir: string;
  constructor(dir?: string) {
    const base = resolve('research/phase1');
    this.dir = dir ? resolve(dir) : join(base, `${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}`);
    if (!this.dir.startsWith(base + '/')) throw new Error('Run directories must be inside research/phase1.');
    mkdirSync(join(this.dir,'responses'), { recursive: true, mode: 0o700 });
  }
  write(name: string, data: unknown) { durableWrite(join(this.dir,name), JSON.stringify(data,null,2)+'\n'); }
  read<T>(name: string): T | undefined { const p=join(this.dir,name); return existsSync(p) ? JSON.parse(readFileSync(p,'utf8')) : undefined; }
  append(name: string, value: unknown) {
    const fd=openSync(join(this.dir,name),'a',0o600);
    try { appendFileSync(fd,JSON.stringify(value)+'\n'); fsyncSync(fd); } finally { closeSync(fd); }
  }
  body(id: string, bytes: Buffer) { durableWrite(join(this.dir,'responses',`${id}.body`),bytes); }
}
