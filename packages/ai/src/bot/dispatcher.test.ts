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
import { parseCommand } from './types';
import { BotDispatcher, getBotDispatcher } from './dispatcher';

describe('parseCommand', () => {
  it('parses a simple command', () => {
    const result = parseCommand('/analyze XAUUSD');
    expect(result.command).toBe('analyze');
    expect(result.args).toEqual(['XAUUSD']);
  });

  it('parses a command with multiple args', () => {
    const result = parseCommand('/alert XAUUSD > 2700');
    expect(result.command).toBe('alert');
    expect(result.args).toEqual(['XAUUSD', '>', '2700']);
  });

  it('handles command with @botname suffix', () => {
    const result = parseCommand('/price@hamafxbot EURUSD');
    expect(result.command).toBe('price');
    expect(result.args).toEqual(['EURUSD']);
  });

  it('handles command with no args', () => {
    const result = parseCommand('/help');
    expect(result.command).toBe('help');
    expect(result.args).toEqual([]);
  });

  it('handles non-command text', () => {
    const result = parseCommand('hello world');
    expect(result.command).toBe('');
    expect(result.args).toEqual([]);
  });

  it('handles empty string', () => {
    const result = parseCommand('');
    expect(result.command).toBe('');
    expect(result.args).toEqual([]);
  });

  it('handles extra whitespace', () => {
    const result = parseCommand('/ask   is   gold   bullish?');
    expect(result.command).toBe('ask');
    expect(result.args).toEqual(['is', 'gold', 'bullish?']);
  });

  it('lowercases the command name', () => {
    const result = parseCommand('/ANALYZE XAUUSD');
    expect(result.command).toBe('analyze');
  });
});

describe('BotDispatcher', () => {
  it('registers and dispatches commands', async () => {
    const dispatcher = new BotDispatcher();
    const ctx = {
      userId: 'test-user',
      chatId: '123',
      platform: 'telegram' as const,
    };

    const response = await dispatcher.dispatch('/help', ctx);
    expect(response.text).toBeDefined();
    expect(response.text).toContain('HamaFX Bot Commands');
  });

  it('returns help for unknown commands', async () => {
    const dispatcher = new BotDispatcher();
    const ctx = {
      userId: 'test-user',
      chatId: '123',
      platform: 'telegram' as const,
    };

    const response = await dispatcher.dispatch('/nonexistent', ctx);
    expect(response.text).toContain('Unknown command');
    expect(response.text).toContain('/help');
  });

  it('returns help for non-command text', async () => {
    const dispatcher = new BotDispatcher();
    const ctx = {
      userId: 'test-user',
      chatId: '123',
      platform: 'telegram' as const,
    };

    const response = await dispatcher.dispatch('hello there', ctx);
    expect(response.text).toBeDefined();
  });

  it('listCommands returns all registered commands', () => {
    const dispatcher = new BotDispatcher();
    const commands = dispatcher.listCommands();
    const names = commands.map((c) => c.name);

    expect(names).toContain('help');
    expect(names).toContain('price');
    expect(names).toContain('analyze');
    expect(names).toContain('ask');
    expect(names).toContain('status');
    expect(names).toContain('chart');
    expect(names).toContain('alert');
    expect(names).toContain('positions');
    expect(names).toContain('track');
    expect(names).toContain('link');
  });

  it('getBotDispatcher returns a singleton', () => {
    const d1 = getBotDispatcher();
    const d2 = getBotDispatcher();
    expect(d1).toBe(d2);
  });

  it('dispatches /price with no args → usage message', async () => {
    const dispatcher = new BotDispatcher();
    const ctx = {
      userId: 'test-user',
      chatId: '123',
      platform: 'telegram' as const,
    };

    const response = await dispatcher.dispatch('/price', ctx);
    expect(response.text).toContain('Usage: /price');
  });

  it('dispatches /alert with no args → usage message', async () => {
    const dispatcher = new BotDispatcher();
    const ctx = {
      userId: 'test-user',
      chatId: '123',
      platform: 'telegram' as const,
    };

    const response = await dispatcher.dispatch('/alert', ctx);
    expect(response.text).toContain('Usage: /alert');
  });

  it('dispatches /link with no args → instructions', async () => {
    const dispatcher = new BotDispatcher();
    const ctx = {
      userId: '',
      chatId: '123',
      platform: 'telegram' as const,
    };

    const response = await dispatcher.dispatch('/link', ctx);
    expect(response.text).toContain('Link Your HamaFX Account');
  });

  it('dispatches /ask with no args → usage message', async () => {
    const dispatcher = new BotDispatcher();
    const ctx = {
      userId: 'test-user',
      chatId: '123',
      platform: 'telegram' as const,
    };

    const response = await dispatcher.dispatch('/ask', ctx);
    expect(response.text).toContain('Usage: /ask');
  });

  it('dispatches /analyze with no args → usage message', async () => {
    const dispatcher = new BotDispatcher();
    const ctx = {
      userId: 'test-user',
      chatId: '123',
      platform: 'telegram' as const,
    };

    const response = await dispatcher.dispatch('/analyze', ctx);
    expect(response.text).toContain('Usage: /analyze');
  });

  it('dispatches /chart with no args → usage message', async () => {
    const dispatcher = new BotDispatcher();
    const ctx = {
      userId: 'test-user',
      chatId: '123',
      platform: 'telegram' as const,
    };

    const response = await dispatcher.dispatch('/chart', ctx);
    expect(response.text).toContain('Usage: /chart');
  });
});
