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
import { selectAgents, autoDetectMode, resolveMode, MODE_OPTIONS } from '../../src/multi-agent/modes';

describe('modes — selectAgents', () => {
  it('returns no agents for single mode', () => { expect(selectAgents('single')).toEqual([]); });
  it('returns only technical for quick mode', () => { expect(selectAgents('quick')).toEqual(['technical']); });
  it('returns technical + fundamental for standard mode', () => { expect(selectAgents('standard')).toEqual(['technical', 'fundamental']); });
  it('returns all 4 specialists for full mode', () => { expect(selectAgents('full')).toEqual(['technical', 'fundamental', 'risk', 'sentiment']); });
});

describe('modes — autoDetectMode', () => {
  it('detects full mode for "should I buy" questions', () => {
    expect(autoDetectMode('Should I buy XAUUSD now?')).toBe('full');
    expect(autoDetectMode('should i sell EURUSD?')).toBe('full');
    expect(autoDetectMode('Is it a good time to buy gold?')).toBe('full');
    expect(autoDetectMode('should I go long on GBPUSD?')).toBe('full');
  });
  it('detects single mode for price questions (covered by LIVE_SNAPSHOT)', () => {
    expect(autoDetectMode("what's the price of XAUUSD?")).toBe('single');
    expect(autoDetectMode('current price for EURUSD')).toBe('single');
    expect(autoDetectMode('how much is gold right now?')).toBe('single');
  });
  it('detects standard mode for analysis questions', () => {
    expect(autoDetectMode('analyze XAUUSD')).toBe('standard');
    expect(autoDetectMode('what is your outlook on EURUSD?')).toBe('standard');
    expect(autoDetectMode('what do you think about gold?')).toBe('standard');
  });
  it('detects single mode for greetings and trivial messages', () => {
    expect(autoDetectMode('hello')).toBe('single');
    expect(autoDetectMode('hi')).toBe('single');
    expect(autoDetectMode('thanks')).toBe('single');
  });
  it('defaults to standard for ambiguous questions (10+ chars, no keywords)', () => {
    expect(autoDetectMode('tell me about trading')).toBe('standard');
    expect(autoDetectMode('anything interesting happening')).toBe('standard');
  });
});

describe('modes — resolveMode', () => {
  it('passes through non-auto modes', () => {
    expect(resolveMode('single', 'test')).toBe('single');
    expect(resolveMode('quick', 'test')).toBe('quick');
    expect(resolveMode('standard', 'test')).toBe('standard');
    expect(resolveMode('full', 'test')).toBe('full');
  });
  it('auto-detects when mode is auto', () => {
    expect(resolveMode('auto', 'should I buy XAUUSD?')).toBe('full');
    // Price questions route to single (covered by LIVE_SNAPSHOT).
    expect(resolveMode('auto', "what's the price?")).toBe('single');
    expect(resolveMode('auto', 'analyze EURUSD')).toBe('standard');
  });
});

describe('modes — MODE_OPTIONS', () => {
  it('includes all 5 modes', () => {
    const values = MODE_OPTIONS.map((m) => m.value);
    expect(values).toContain('auto'); expect(values).toContain('single'); expect(values).toContain('quick'); expect(values).toContain('standard'); expect(values).toContain('full');
  });
  it('has correct LLM call counts', () => {
    const full = MODE_OPTIONS.find((m) => m.value === 'full')!;
    expect(full.llmCalls).toBe(5);
  });
});
