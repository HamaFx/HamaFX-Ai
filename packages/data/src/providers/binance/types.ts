export interface BinanceKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteVolume: string;
  trades: number;
  takerBuyBaseVolume: string;
  takerBuyQuoteVolume: string;
  ignore: string;
}

export function parseKline(raw: unknown[]): BinanceKline {
  return {
    openTime: Number(raw[0]),
    open: String(raw[1]),
    high: String(raw[2]),
    low: String(raw[3]),
    close: String(raw[4]),
    volume: String(raw[5]),
    closeTime: Number(raw[6]),
    quoteVolume: String(raw[7]),
    trades: Number(raw[8]),
    takerBuyBaseVolume: String(raw[9]),
    takerBuyQuoteVolume: String(raw[10]),
    ignore: String(raw[11]),
  };
}

export interface NormalizedBinanceCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}
