import { db } from "../server/db";
import { channels } from "../shared/schema";
import { eq } from "drizzle-orm";

(async()=>{
  const all = await db.select().from(channels);
  console.log('found', all.length, 'channels');
  const keep = all.find(c=>c.name==='General') || all[0];
  console.log('keeping', keep.id, keep.name);
  for(const c of all){
    if(c.id===keep.id) continue;
    try{
      await db.delete(channels).where(eq(channels.id, c.id));
      console.log('deleted', c.id, c.name);
    }catch(e){
      console.error('err deleting', c.id, e);
    }
  }
  const rem = await db.select().from(channels);
  console.log('remaining', rem.map(r=>({id:r.id,name:r.name})));
  process.exit(0);
})().catch(e=>{console.error(e); process.exit(1)});
