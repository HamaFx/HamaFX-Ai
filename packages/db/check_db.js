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

import postgres from 'postgres';
const sql2 = postgres(process.env.POSTGRES_URL);
async function run() {
  try {
    const res = await sql2`SELECT count(*) FROM chat_threads`;
    console.log("chat_threads count:", res[0].count);
    const res2 = await sql2`SELECT count(*) FROM user_settings`;
    console.log("user_settings count:", res2[0].count);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
run();
