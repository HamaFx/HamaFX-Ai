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

import { boolean, integer, pgTable, real, text } from 'drizzle-orm/pg-core';

export const symbolCatalog = pgTable('symbol_catalog', {
  symbol: text('symbol').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  exchange: text('exchange'),
  tvTicker: text('tv_ticker'),
  // Provider-specific symbol formats (added in market data architecture redesign)
  twelveDataSymbol: text('twelve_data_symbol'),
  biquoteSymbol: text('biquote_symbol'),
  binanceSymbol: text('binance_symbol'),
  finnhubSymbol: text('finnhub_symbol'),
  pipSize: real('pip_size'),
  priceDecimals: integer('price_decimals'),
  currencyTags: text('currency_tags').array(),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
});

export type SymbolCatalogRow = typeof symbolCatalog.$inferSelect;
export type SymbolCatalogInsert = typeof symbolCatalog.$inferInsert;
