// SPDX-License-Identifier: Apache-2.0

// PF-22 — Service layer example extracted from /api/news route handler.
//
// The service layer separates business logic from HTTP concerns (request
// parsing, response formatting). Routes delegate to services, keeping
// route handlers thin and testable without HTTP mocks.

import { listRecentArticles } from '@hamafx/ai';

export interface NewsFilters {
  sentiment?: string;
  symbol?: string;
  query?: string;
}

export interface NewsResult {
  items: Array<Record<string, unknown>>;
  hasMore: boolean;
  nextOffset: number;
}

/**
 * Fetch news articles with pagination and filtering.
 * Extracted from the /api/news route handler so the logic is testable
 * without HTTP infrastructure.
 */
export async function fetchNewsArticles(
  offset: number,
  limit: number,
  filters: NewsFilters,
): Promise<NewsResult> {
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  const safeLimit = Number.isFinite(limit) && limit >= 1 && limit <= 100 ? limit : 20;

  // Fetch safeLimit + 1 to detect if there are more results
  const articlesWithOneExtra = await listRecentArticles(safeLimit + 1, safeOffset, filters);
  const hasMore = articlesWithOneExtra.length > safeLimit;
  const items = articlesWithOneExtra.slice(0, safeLimit) as Array<Record<string, unknown>>;

  return { items, hasMore, nextOffset: safeOffset + items.length };
}

/**
 * Parse URL search params into a NewsFilters object.
 */
export function parseNewsFilters(url: URL): NewsFilters {
  const filters: NewsFilters = {};
  const sentiment = url.searchParams.get('sentiment');
  const symbol = url.searchParams.get('symbol');
  const query = url.searchParams.get('q');

  if (sentiment !== null) filters.sentiment = sentiment;
  if (symbol !== null) filters.symbol = symbol;
  if (query !== null) filters.query = query;

  return filters;
}
