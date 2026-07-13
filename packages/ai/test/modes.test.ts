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

// P3-13 — Unit tests for autoDetectMode and resolveMode.

import { describe, expect, it } from 'vitest';
import { autoDetectMode, resolveMode, selectAgents } from '../src/multi-agent/modes';

describe('autoDetectMode', () => {
  it('returns single for greetings and thanks', () => {
    expect(autoDetectMode('hi')).toBe('single');
    expect(autoDetectMode('hello')).toBe('single');
    expect(autoDetectMode('hey')).toBe('single');
    expect(autoDetectMode('thanks')).toBe('single');
    expect(autoDetectMode('thank you')).toBe('single');
    expect(autoDetectMode('ok')).toBe('single');
    expect(autoDetectMode('okay')).toBe('single');
    expect(autoDetectMode('yes')).toBe('single');
    expect(autoDetectMode('no')).toBe('single');
    expect(autoDetectMode('bye')).toBe('single');
    expect(autoDetectMode('good morning')).toBe('single');
    expect(autoDetectMode('good night')).toBe('single');
  });

  it('returns single for simple price checks', () => {
    expect(autoDetectMode("what's the price of gold")).toBe('single');
    expect(autoDetectMode("what's the price")).toBe('single');
    expect(autoDetectMode('current price of XAUUSD')).toBe('single');
    expect(autoDetectMode('quote for EURUSD')).toBe('single');
    expect(autoDetectMode('how much is gold')).toBe('single');
  });

  it('returns full for trading decision questions', () => {
    expect(autoDetectMode('should i buy gold here')).toBe('full');
    expect(autoDetectMode('should i sell EURUSD')).toBe('full');
    expect(autoDetectMode('is it a good time to buy XAUUSD')).toBe('full');
    expect(autoDetectMode('is now a good time for GBPUSD')).toBe('full');
    expect(autoDetectMode('buy or sell gold')).toBe('full');
  });

  it('returns standard for analysis questions', () => {
    expect(autoDetectMode('analyze XAUUSD 1h chart')).toBe('standard');
    expect(autoDetectMode('analysis of EURUSD')).toBe('standard');
    expect(autoDetectMode('what do you think about gold')).toBe('standard');
    expect(autoDetectMode('forecast XAUUSD this week')).toBe('standard');
    expect(autoDetectMode('outlook on GBPUSD')).toBe('standard');
  });

  it('returns single for short ambiguous prompts', () => {
    expect(autoDetectMode('?')).toBe('single');
    expect(autoDetectMode('go')).toBe('single');
    expect(autoDetectMode('xau')).toBe('single');
  });

  it('returns standard for longer ambiguous messages', () => {
    expect(autoDetectMode('tell me something interesting about the gold market')).toBe('standard');
  });
});

describe('resolveMode', () => {
  it('passes through explicit modes', () => {
    expect(resolveMode('single', 'should i buy gold')).toBe('single');
    expect(resolveMode('quick', 'should i buy gold')).toBe('quick');
    expect(resolveMode('standard', 'should i buy gold')).toBe('standard');
    expect(resolveMode('full', 'should i buy gold')).toBe('full');
  });

  it('auto-detects for auto mode', () => {
    expect(resolveMode('auto', 'should i buy gold')).toBe('full');
    expect(resolveMode('auto', 'hi')).toBe('single');
  });
});

describe('selectAgents', () => {
  it('returns empty for single mode', () => {
    expect(selectAgents('single')).toEqual([]);
  });

  it('returns technical only for quick', () => {
    expect(selectAgents('quick')).toEqual(['technical']);
  });

  it('returns technical + fundamental for standard', () => {
    expect(selectAgents('standard')).toEqual(['technical', 'fundamental']);
  });

  it('returns all four for full', () => {
    expect(selectAgents('full')).toEqual(['technical', 'fundamental', 'risk', 'sentiment']);
  });
});
