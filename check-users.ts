import { db } from "./server/db";
import { users } from "./shared/models/auth";

async function checkUsers() {
  const allUsers = await db.select().from(users);
  console.log(JSON.stringify(allUsers, null, 2));
  process.exit(0);
}

checkUsers().catch(err => {
  console.error(err);
  process.exit(1);
});
