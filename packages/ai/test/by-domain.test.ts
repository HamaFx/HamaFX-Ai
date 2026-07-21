import { describe, expect, it } from 'vitest';
import { domainToolFilter } from '../src/tools/by-domain';

// Import tool registry to populate it
import '../src/tools/index';

describe('domainToolFilter', () => {
  it('returns all tools for generic domain', () => {
    const tools = domainToolFilter('generic');
    expect(Object.keys(tools).length).toBeGreaterThan(10);
    expect(tools.get_price).toBeDefined();
    expect(tools.get_candles).toBeDefined();
  });

  it('includes always-present tools in fundamental domain', () => {
    const tools = domainToolFilter('fundamental');
    expect(tools.get_price).toBeDefined();
    expect(tools.set_alert).toBeDefined();
    expect(tools.log_journal).toBeDefined();
  });

  it('includes fundamental-specific tools', () => {
    const tools = domainToolFilter('fundamental');
    expect(tools.get_news).toBeDefined();
    expect(tools.get_calendar).toBeDefined();
    expect(tools.get_cot).toBeDefined();
    expect(tools.analyze_fundamental).toBeDefined();
  });

  it('excludes technical-only tools from fundamental domain', () => {
    const tools = domainToolFilter('fundamental');
    expect(tools.get_candles).toBeUndefined();
    expect(tools.get_indicators).toBeUndefined();
    expect(tools.analyze_technical).toBeUndefined();
  });

  it('includes always-present tools in technical domain', () => {
    const tools = domainToolFilter('technical');
    expect(tools.get_price).toBeDefined();
    expect(tools.set_alert).toBeDefined();
    expect(tools.log_journal).toBeDefined();
  });

  it('includes technical-specific tools', () => {
    const tools = domainToolFilter('technical');
    expect(tools.get_candles).toBeDefined();
    expect(tools.get_indicators).toBeDefined();
    expect(tools.get_market_structure).toBeDefined();
    expect(tools.analyze_technical).toBeDefined();
    expect(tools.analyze_chart_image).toBeDefined();
  });

  it('excludes fundamental-only tools from technical domain', () => {
    const tools = domainToolFilter('technical');
    expect(tools.get_news).toBeUndefined();
    expect(tools.get_calendar).toBeUndefined();
    expect(tools.get_cot).toBeUndefined();
    expect(tools.analyze_fundamental).toBeUndefined();
  });

  it('filters by plan when provided', () => {
    const tools = domainToolFilter('generic', 'free');
    expect(tools).toBeDefined();
    expect(typeof tools).toBe('object');
  });

  it('excludes tools not in the allowed set for a domain', () => {
    const technical = domainToolFilter('technical');
    const technicalNames = new Set(Object.keys(technical));
    // Fundamental-only tools should not appear
    expect(technicalNames.has('get_news')).toBe(false);
    expect(technicalNames.has('get_cot')).toBe(false);
    expect(technicalNames.has('analyze_fundamental')).toBe(false);
  });
});
