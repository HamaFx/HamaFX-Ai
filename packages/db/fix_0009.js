/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs');
let content = fs.readFileSync('drizzle/0009_rare_iron_fist.sql', 'utf8');

// Insert the __system__ user right after the "user" table is created.
const createTableUser = `CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp with time zone,
	"image" text,
	"hashedPassword" text,
	"role" text DEFAULT 'user' NOT NULL,
	"deletedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
`;

const systemUserInsert = `INSERT INTO "user" ("id", "email", "name", "role") VALUES ('__system__', 'system@localhost', 'System', 'user') ON CONFLICT ("email") DO NOTHING;
--> statement-breakpoint
`;

content = content.replace(createTableUser, createTableUser + systemUserInsert);

// Replace ADD COLUMN ... NOT NULL with DEFAULT '__system__' NOT NULL
content = content.replace(/ADD COLUMN "user_id" text NOT NULL/g, 'ADD COLUMN "user_id" text DEFAULT \'__system__\' NOT NULL');

fs.writeFileSync('drizzle/0009_rare_iron_fist.sql', content);
