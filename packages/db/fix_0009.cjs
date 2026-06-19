const fs = require('fs');
let content = fs.readFileSync('drizzle/0009_rare_iron_fist.sql', 'utf8');

const createTableUserRegex = /CREATE TABLE "user" \([\s\S]*?\);\n--> statement-breakpoint\n/;
const match = content.match(createTableUserRegex);

if (match) {
  const systemUserInsert = `INSERT INTO "user" ("id", "email", "name", "role") VALUES ('__system__', 'system@localhost', 'System', 'user') ON CONFLICT ("email") DO NOTHING;\n--> statement-breakpoint\n`;
  content = content.replace(match[0], match[0] + systemUserInsert);
  fs.writeFileSync('drizzle/0009_rare_iron_fist.sql', content);
}
