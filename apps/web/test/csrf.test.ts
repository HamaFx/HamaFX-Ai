// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchCsrf, getCsrfToken, withCsrf } from '../src/lib/csrf';

beforeEach(() => {
  let cookieStr = '';
  vi.stubGlobal('document', {
    get cookie() { return cookieStr; },
    set cookie(val: string) { cookieStr = val; },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getCsrfToken', () => {
  it('returns undefined when no cookie is set', () => {
    document.cookie = '';
    expect(getCsrfToken()).toBeUndefined();
  });

  it('returns undefined when hfx_csrf cookie is absent among other cookies', () => {
    document.cookie = 'other=value; another=123';
    expect(getCsrfToken()).toBeUndefined();
  });

  it('extracts the token when hfx_csrf is the only cookie', () => {
    document.cookie = 'hfx_csrf=my-token-value';
    expect(getCsrfToken()).toBe('my-token-value');
  });

  it('extracts the token when hfx_csrf is among multiple cookies', () => {
    document.cookie = 'session=abc123; hfx_csrf=csrf-token; theme=dark';
    expect(getCsrfToken()).toBe('csrf-token');
  });

  it('decodes URI-encoded token values', () => {
    document.cookie = 'hfx_csrf=hello%20world%21';
    expect(getCsrfToken()).toBe('hello world!');
  });

  it('handles token with special characters', () => {
    document.cookie = 'hfx_csrf=aB3_xYz-9Qw';
    expect(getCsrfToken()).toBe('aB3_xYz-9Qw');
  });

  it('returns empty string when cookie value is empty', () => {
    document.cookie = 'hfx_csrf=';
    expect(getCsrfToken()).toBe('');
  });

  it('handles cookie with trailing semicolon', () => {
    document.cookie = 'hfx_csrf=token123;';
    expect(getCsrfToken()).toBe('token123');
  });
});

describe('withCsrf', () => {
  it('returns empty init when no token and no init', () => {
    document.cookie = '';
    expect(withCsrf()).toEqual({});
  });

  it('returns init unchanged when no token', () => {
    document.cookie = '';
    expect(withCsrf({ method: 'POST' })).toEqual({ method: 'POST' });
  });

  it('appends X-CSRF-Token header when token is present', () => {
    document.cookie = 'hfx_csrf=my-token';
    const result = withCsrf({ method: 'POST' });
    expect(result.method).toBe('POST');
    const headers = result.headers as Headers;
    expect(headers.get('X-CSRF-Token')).toBe('my-token');
  });

  it('preserves existing headers and adds CSRF token', () => {
    document.cookie = 'hfx_csrf=token123';
    const existing = new Headers({ 'Content-Type': 'application/json' });
    const result = withCsrf({ headers: existing });
    const headers = result.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-CSRF-Token')).toBe('token123');
  });

  it('overwrites existing X-CSRF-Token header with new token', () => {
    document.cookie = 'hfx_csrf=new-token';
    const existing = new Headers({ 'X-CSRF-Token': 'old-token' });
    const result = withCsrf({ headers: existing });
    const headers = result.headers as Headers;
    expect(headers.get('X-CSRF-Token')).toBe('new-token');
  });

  it('handles plain object headers', () => {
    document.cookie = 'hfx_csrf=token456';
    const result = withCsrf({ headers: { Authorization: 'Bearer xyz' } });
    const headers = result.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer xyz');
    expect(headers.get('X-CSRF-Token')).toBe('token456');
  });
});

describe('fetchCsrf', () => {
  it('calls fetch with the CSRF token appended', async () => {
    document.cookie = 'hfx_csrf=test-csrf';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());

    await fetchCsrf('/api/data', { method: 'POST' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/data');
    expect(init.method).toBe('POST');
    const headers = init.headers as Headers;
    expect(headers.get('X-CSRF-Token')).toBe('test-csrf');

    fetchSpy.mockRestore();
  });

  it('calls fetch without CSRF when no token is present', async () => {
    document.cookie = '';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());

    await fetchCsrf('/api/data', { method: 'GET' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/data');
    expect(init!.method).toBe('GET');
    const headers = init!.headers as Headers | undefined;
    expect(headers?.get('X-CSRF-Token')).toBeUndefined();

    fetchSpy.mockRestore();
  });

  it('passes URL object to fetch', async () => {
    document.cookie = 'hfx_csrf=t';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    const url = new URL('https://example.com/api');

    await fetchCsrf(url);

    expect(fetchSpy).toHaveBeenCalledWith(url, expect.anything());
    fetchSpy.mockRestore();
  });
});
