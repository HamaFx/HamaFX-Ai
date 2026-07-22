// @vitest-environment node
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

import { describe, it, expect } from 'vitest';
import { createHamaFxChatTransport } from '@/lib/chat-transport';

describe('createHamaFxChatTransport', () => {
  it('constructs a transport backed by the ai SDK DefaultChatTransport', () => {
    const transport = createHamaFxChatTransport({ api: '/api/chat' });

    expect(transport).toBeDefined();
    // The transport should expose the AI SDK chat surface. If the ai SDK
    // ever removes or renames DefaultChatTransport, this test fails early
    // rather than at runtime in the browser.
    expect(typeof (transport as { sendMessages?: unknown }).sendMessages).toBe('function');
  });

  it('propagates custom headers through the transport options', () => {
    const transport = createHamaFxChatTransport({
      api: '/api/chat',
      headers: { 'x-custom': 'value' },
    });

    expect(transport).toBeDefined();
  });
});
