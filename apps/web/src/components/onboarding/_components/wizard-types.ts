export type TradingStyle = 'scalper' | 'day_trader' | 'swing' | 'position';

export type TestState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'ok' }
  | { kind: 'err'; message: string };
