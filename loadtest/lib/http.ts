// Thin wrappers over k6/http that:
//   (a) prefix env.baseUrl
//   (b) attach auth headers (for Strategy B CSRF)
//   (c) tag every request with { group } so thresholds can target groups
//   (d) record 429s via record429
//   (e) run basic status checks

import { check } from 'k6';
import http from 'k6/http';
import type { RefinedResponse, ResponseType, Params } from 'k6/http';
import { env } from '../config/environments.js';
import { record429, recordAuthFailure, expectOk } from './checks.js';

export type HttpHeaders = Record<string, string>;

let _csrfHeader: HttpHeaders = {};

/** Set the CSRF header for the current VU iteration. Called by applyAuth(). */
export function setCsrfHeader(headers: HttpHeaders): void {
  _csrfHeader = headers;
}

/**
 * Perform an authed GET request.
 */
export function getJson(
  path: string,
  group: string,
  extraHeaders?: HttpHeaders,
  extraParams?: Partial<Params>,
): RefinedResponse<ResponseType | undefined> {
  const url = `${env.baseUrl}${path}`;
  const params: Params = {
    headers: {
      ..._csrfHeader,
      ...(extraHeaders ?? {}),
    },
    tags: { group },
    ...(extraParams ?? {}),
  };
  const res = http.get(url, params);
  expectOk(res);
  record429(res);
  recordAuthFailure(res);
  return res;
}

/**
 * Perform an authed POST request with a JSON body.
 * Auto-adds the x-csrf-token header for state-changing requests.
 */
export function postJson(
  path: string,
  group: string,
  body: unknown,
  extraHeaders?: HttpHeaders,
  extraParams?: Partial<Params>,
): RefinedResponse<ResponseType | undefined> {
  const url = `${env.baseUrl}${path}`;
  const params: Params = {
    headers: {
      'Content-Type': 'application/json',
      ..._csrfHeader,
      ...(extraHeaders ?? {}),
    },
    tags: { group },
    ...(extraParams ?? {}),
  };
  const res = http.post(url, JSON.stringify(body), params);
  expectOk(res);
  record429(res);
  recordAuthFailure(res);
  return res;
}

/**
 * Perform an authed PATCH request with a JSON body.
 */
export function patchJson(
  path: string,
  group: string,
  body: unknown,
  extraHeaders?: HttpHeaders,
  extraParams?: Partial<Params>,
): RefinedResponse<ResponseType | undefined> {
  const url = `${env.baseUrl}${path}`;
  const params: Params = {
    headers: {
      'Content-Type': 'application/json',
      ..._csrfHeader,
      ...(extraHeaders ?? {}),
    },
    tags: { group },
    ...(extraParams ?? {}),
  };
  const res = http.patch(url, JSON.stringify(body), params);
  expectOk(res);
  record429(res);
  recordAuthFailure(res);
  return res;
}

/**
 * Perform an authed PUT request with a JSON body.
 */
export function putJson(
  path: string,
  group: string,
  body: unknown,
  extraHeaders?: HttpHeaders,
  extraParams?: Partial<Params>,
): RefinedResponse<ResponseType | undefined> {
  const url = `${env.baseUrl}${path}`;
  const params: Params = {
    headers: {
      'Content-Type': 'application/json',
      ..._csrfHeader,
      ...(extraHeaders ?? {}),
    },
    tags: { group },
    ...(extraParams ?? {}),
  };
  const res = http.put(url, JSON.stringify(body), params);
  expectOk(res);
  record429(res);
  recordAuthFailure(res);
  return res;
}

/**
 * Perform an authed DELETE request.
 */
export function deleteReq(
  path: string,
  group: string,
  extraHeaders?: HttpHeaders,
  extraParams?: Partial<Params>,
): RefinedResponse<ResponseType | undefined> {
  const url = `${env.baseUrl}${path}`;
  const params: Params = {
    headers: {
      ..._csrfHeader,
      ...(extraHeaders ?? {}),
    },
    tags: { group },
    ...(extraParams ?? {}),
  };
  const res = http.del(url, null, params);
  // DELETE may return 204 No Content — accept 200 or 204
  check(res, {
    'delete status is 200/204': (r) => r.status === 200 || r.status === 204,
  });
  record429(res);
  recordAuthFailure(res);
  return res;
}

/**
 * Perform an authed GET and return parsed JSON body.
 * Throws if parsing fails or status is not 2xx.
 */
export function getJsonSafe<T = unknown>(
  path: string,
  group: string,
  extraHeaders?: HttpHeaders,
): T | null {
  const res = getJson(path, group, extraHeaders);
  if (res.status < 200 || res.status >= 300) return null;
  try {
    return JSON.parse(res.body as string) as T;
  } catch {
    return null;
  }
}
