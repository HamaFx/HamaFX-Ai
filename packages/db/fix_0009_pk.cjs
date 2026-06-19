const fs = require('fs');
let content = fs.readFileSync('drizzle/0009_rare_iron_fist.sql', 'utf8');

// Find the PK lines
const pkBriefings = `ALTER TABLE "briefings_emitted" ADD CONSTRAINT "briefings_emitted_user_id_event_id_kind_pk" PRIMARY KEY("user_id","event_id","kind");\n--> statement-breakpoint\n`;
const pkDaily = `ALTER TABLE "daily_ai_spend" ADD CONSTRAINT "daily_ai_spend_user_id_day_pk" PRIMARY KEY("user_id","day");\n--> statement-breakpoint\n`;

// Find the ADD COLUMN lines
const addColBriefings = `ALTER TABLE "briefings_emitted" ADD COLUMN "user_id" text DEFAULT '__system__' NOT NULL;\n--> statement-breakpoint\n`;
const addColDaily = `ALTER TABLE "daily_ai_spend" ADD COLUMN "user_id" text DEFAULT '__system__' NOT NULL;\n--> statement-breakpoint\n`;

// Remove them from where they are
content = content.replace(pkBriefings, '');
content = content.replace(pkDaily, '');
content = content.replace(addColBriefings, '');
content = content.replace(addColDaily, '');

// Put them back in the correct order before the chat_threads one
const target = `ALTER TABLE "chat_threads" ADD COLUMN "user_id" text DEFAULT '__system__' NOT NULL;\n--> statement-breakpoint\n`;
const insertion = addColBriefings + addColDaily + pkBriefings + pkDaily + target;

content = content.replace(target, insertion);

fs.writeFileSync('drizzle/0009_rare_iron_fist.sql', content);
