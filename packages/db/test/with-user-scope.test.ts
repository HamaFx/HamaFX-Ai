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

import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withUserScope } from '../src/with-user-scope';

describe('withUserScope', () => {
  it('builds an eq(userId, x) SQL fragment for a table with a userId column', () => {
    // Mock a minimal drizzle table object. The helper only reads .userId,
    // so we don't need a real Drizzle column instance.
    const fakeTable = { userId: { name: 'user_id' } };
    const frag = withUserScope(fakeTable as never, 'user-123');

    // Compare against the canonical eq(table.userId, value) expression.
    const expected = eq(fakeTable.userId as never, 'user-123');
    expect(frag).toEqual(expected);
  });

  it('produces a different fragment for a different userId', () => {
    const fakeTable = { userId: { name: 'user_id' } };
    const a = withUserScope(fakeTable as never, 'user-A');
    const b = withUserScope(fakeTable as never, 'user-B');
    // SQL fragments have value-equal queries via toQuery() comparison, but
    // the easier check is that they reference the same column but different
    // params — verifying with a JSON dump of the internal shape.
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
  });

  it('produces a SQL fragment (does not validate the column shape)', () => {
    // The generic `T extends { userId: unknown }` enforces the column
    // shape at compile time. At runtime, drizzle's `eq()` blindly builds
    // a SQL fragment — so a malformed table would only fail when the
    // query is executed, not when `withUserScope` is called. This test
    // documents that behavior so future readers don't assume otherwise.
    const fakeTableWithoutUserId = { id: 'id' } as unknown as { userId: unknown };
    expect(() => withUserScope(fakeTableWithoutUserId, 'user-123')).not.toThrow();
  });
});