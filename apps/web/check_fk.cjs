const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL);
async function run() {
  const result = await sql`
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'rate_limits'::regclass;
  `;
  console.log(result);
  process.exit(0);
}
run();
