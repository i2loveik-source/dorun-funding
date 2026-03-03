import { storage } from '../server/storage';
(async()=>{
  const channels = await storage.getChannelsWithMemberCounts();
  console.log('Found', channels.length, 'channels');
  const keepId = channels.find(c=>c.name==='General')?.id || channels[0]?.id;
  console.log('Keeping channel id', keepId);
  for(const c of channels){
    if(c.id===keepId) continue;
    try{
      await storage.deleteChannel(c.id);
      console.log('Deleted', c.id, c.name);
    }catch(e){
      console.error('Failed to delete', c.id, e);
    }
  }
  const rem = await storage.getChannelsWithMemberCounts();
  console.log('Remaining channels:', rem.map(r=>({id:r.id,name:r.name}))); 
  process.exit(0);
})().catch(e=>{console.error(e); process.exit(1)});
