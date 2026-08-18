// SPDX-License-Identifier: Apache-2.0

/**
 * Focused XAUUSD eval set used by the Admin → AI Eval runner.
 *
 * Every prompt is deliberately read-only gold/XAUUSD analysis: it contains
 * no other-symbol terms, no mutation words (buy/sell/trade/alert/…), and no
 * injection markers, so the chat route routes each one to the Mastra agent
 * and records a Mastra-vs-legacy shadow comparison in Admin → AI Compare.
 */
export interface AiEvalPrompt {
  id: string;
  prompt: string;
}

export const AI_EVAL_PROMPTS: readonly AiEvalPrompt[] = [
  { id: 'x01', prompt: 'Give me a top-down read on gold from 4H down to 15M.' },
  { id: 'x02', prompt: 'What is the current XAUUSD bias and how confident should I be?' },
  { id: 'x03', prompt: 'Analyse gold across the daily, 4-hour, 1-hour and 15-minute timeframes.' },
  { id: 'x04', prompt: 'Is gold bullish or bearish right now? Show the scenarios either way.' },
  { id: 'x05', prompt: 'Where are the key support and resistance levels on XAUUSD right now?' },
  { id: 'x06', prompt: 'What does the RSI say about gold on the 1-hour chart?' },
  { id: 'x07', prompt: 'Is there RSI divergence on gold right now?' },
  { id: 'x08', prompt: 'How is the MACD trending on XAUUSD on the 4-hour chart?' },
  { id: 'x09', prompt: 'What is the daily trend on gold and what would invalidate it?' },
  { id: 'x10', prompt: 'What is the 15-minute structure on XAUUSD and where are the recent highs and lows?' },
  { id: 'x11', prompt: 'What are the bullish and bearish scenarios for gold this session?' },
  { id: 'x12', prompt: 'What would invalidate the current gold trend?' },
  { id: 'x13', prompt: 'Where are gold invalidation levels for the current setup?' },
  { id: 'x14', prompt: 'What is the volatility regime on XAUUSD right now?' },
  { id: 'x15', prompt: 'What are the ATR readings telling me about gold?' },
  { id: 'x16', prompt: 'What are the important levels to watch on XAUUSD today?' },
  { id: 'x17', prompt: 'How are the moving averages aligned on gold across timeframes?' },
  { id: 'x18', prompt: 'What do the Bollinger bands say about XAUUSD right now?' },
  { id: 'x19', prompt: 'What is the current price action telling me on gold?' },
  { id: 'x20', prompt: 'What is the higher-timeframe picture on gold, and what does it imply for the shorter timeframes?' },
  { id: 'x21', prompt: 'What macro events could move gold in the next 24 hours?' },
  { id: 'x22', prompt: "Summarise today's gold-relevant news and what to watch." },
  { id: 'x23', prompt: 'How is the dollar index moving and what does it mean for gold?' },
  { id: 'x24', prompt: 'What is the relationship between real yields and gold right now?' },
  { id: 'x25', prompt: 'What is the current data quality of my gold analysis and what evidence is missing?' },
  { id: 'x26', prompt: 'What are the conflicting signals in gold right now across timeframes?' },
  { id: 'x27', prompt: 'What is the most important level on XAUUSD right now and why?' },
  { id: 'x28', prompt: 'Give me the current gold trend, momentum, and volatility in one summary.' },
  { id: 'x29', prompt: 'What is the outlook for gold today based on price action?' },
  { id: 'x30', prompt: 'What evidence supports the current gold bias and what would change my mind?' },
];
