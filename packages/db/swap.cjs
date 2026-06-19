const fs = require("fs");
let lines = fs.readFileSync("drizzle/0009_rare_iron_fist.sql", "utf8").split("--> statement-breakpoint");
// find indices
let pkBriefingsIdx = lines.findIndex(l => l.includes("ADD CONSTRAINT \"briefings_emitted_user_id_event_id_kind_pk\" PRIMARY KEY"));
let pkDailyIdx = lines.findIndex(l => l.includes("ADD CONSTRAINT \"daily_ai_spend_user_id_day_pk\" PRIMARY KEY"));
let colBriefingsIdx = lines.findIndex(l => l.includes("ALTER TABLE \"briefings_emitted\" ADD COLUMN \"user_id\""));
let colDailyIdx = lines.findIndex(l => l.includes("ALTER TABLE \"daily_ai_spend\" ADD COLUMN \"user_id\""));

console.log(pkBriefingsIdx, pkDailyIdx, colBriefingsIdx, colDailyIdx);

let pkB = lines[pkBriefingsIdx];
let colB = lines[colBriefingsIdx];
lines[pkBriefingsIdx] = colB;
lines[colBriefingsIdx] = pkB;

let pkD = lines[pkDailyIdx];
let colD = lines[colDailyIdx];
lines[pkDailyIdx] = colD;
lines[colDailyIdx] = pkD;

fs.writeFileSync("drizzle/0009_rare_iron_fist.sql", lines.join("--> statement-breakpoint"));
