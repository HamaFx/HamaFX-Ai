const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL);
async function run() {
  try {
    const res = await sql`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'daily_ai_spend' AND constraint_type = 'PRIMARY KEY';
    `;
    console.log("daily_ai_spend PKs:", res);

    const res2 = await sql`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'briefings_emitted' AND constraint_type = 'PRIMARY KEY';
    `;
    console.log("briefings_emitted PKs:", res2);

  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
run();
