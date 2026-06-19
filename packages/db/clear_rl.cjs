const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL);
async function run() {
  await sql`DELETE FROM "rate_limits"`;
  console.log("Cleared rate limits");
  process.exit(0);
}
run();
