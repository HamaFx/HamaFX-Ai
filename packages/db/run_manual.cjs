const postgres = require('postgres');
const fs = require('fs');
const sql = postgres(process.env.POSTGRES_URL);

async function run() {
  const file = fs.readFileSync('drizzle/0009_rare_iron_fist.sql', 'utf8');
  const statements = file.split('--> statement-breakpoint').map(s => s.trim()).filter(s => s);
  
  try {
    await sql.begin(async (tx) => {
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        console.log(`Running [${i}]: ${stmt.substring(0, 80)}...`);
        try {
          await tx.unsafe(stmt);
        } catch(e) {
          console.error(`Error at statement ${i}:`, e.message);
          throw e; // abort transaction
        }
      }
    });
    console.log("Success!");
    
    // update journal!
    const res = await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('manual_hash', extract(epoch from now()) * 1000)`;
    console.log("Inserted to journal");
  } catch (e) {
    console.error("Transaction rolled back.");
  }
  process.exit(0);
}
run();
