import { db } from "./server/db";
import { channels, channelMembers } from "./shared/schema";

async function debugData() {
  const allChannels = await db.select().from(channels);
  console.log("CHANNELS:", JSON.stringify(allChannels, null, 2));
  
  const allMembers = await db.select().from(channelMembers);
  console.log("MEMBERS:", JSON.stringify(allMembers, null, 2));
  
  process.exit(0);
}

debugData().catch(err => {
  console.error(err);
  process.exit(1);
});
