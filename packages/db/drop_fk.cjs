const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL);
async function run() {
  try {
    await sql`ALTER TABLE "rate_limits" DROP CONSTRAINT IF EXISTS "rate_limits_user_id_user_id_fk";`;
    console.log("Dropped FK");
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
run();
