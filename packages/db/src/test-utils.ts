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

import { getDb } from './client';

/**
 * Executes a test block inside a rolled-back transaction.
 * This guarantees the database is clean between tests.
 *
 * @param testFn The test logic to execute with the transaction DB client
 */
export async function withIsolatedDb(
  testFn: (tx: ReturnType<typeof getDb>) => Promise<void>,
) {
  try {
    const db = getDb();
    await db.transaction(async (tx) => {
      await testFn(tx as unknown as ReturnType<typeof getDb>);
      throw new Error('ROLLBACK_FOR_TESTING');
    });
  } catch (err) {
    if (err instanceof Error && err.message !== 'ROLLBACK_FOR_TESTING') {
      throw err;
    }
  }
}
