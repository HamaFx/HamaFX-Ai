// SPDX-License-Identifier: Apache-2.0

// NOWPayments REST API client.
// Thin wrapper around fetch() for the NOWPayments API.
// API docs: https://api-docs.nowpayments.io/

import { getServerEnv } from '@/lib/env';
import { createScopedLoggerWithContext } from '@/lib/logger';

export interface NowPaymentsInvoice {
  id: string;
  invoice_url: string;
  status: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  created_at: string;
  updated_at: string;
}

export interface NowPaymentResult {
  payment_id: string;
  invoice_id: string;
  payment_status: string;
  pay_amount: number;
  pay_currency: string;
  price_amount: number;
  price_currency: string;
  purchase_id?: string;
  order_description?: string;
  outcome_amount?: number;
  outcome_currency?: string;
  txid?: string;
}

export interface CreateInvoiceParams {
  price_amount: number;
  price_currency: string;
  pay_currency: string;
  order_id: string;
  order_description: string;
  success_url?: string;
  cancelled_url?: string;
}

export async function createInvoice(params: CreateInvoiceParams): Promise<NowPaymentsInvoice> {
  const env = getServerEnv();
  const apiKey = env.NOWPAYMENTS_API_KEY;
  const baseUrl = env.NOWPAYMENTS_API_BASE ?? 'https://api-sandbox.nowpayments.io';

  if (baseUrl.includes('sandbox') && process.env.NODE_ENV === 'production') {
    createScopedLoggerWithContext({ component: 'nowpayments', operation: 'createInvoice' }).error(
      { nowpaymentsBaseUrl: baseUrl },
      'Using sandbox API in production — set NOWPAYMENTS_API_BASE',
    );
  }

  if (!apiKey) {
    throw new Error('NOWPAYMENTS_API_KEY is not configured');
  }

  const body: Record<string, unknown> = {
    price_amount: params.price_amount,
    price_currency: params.price_currency,
    pay_currency: params.pay_currency,
    order_id: params.order_id,
    order_description: params.order_description,
  };

  if (params.success_url) body.success_url = params.success_url;
  if (params.cancelled_url) body.cancelled_url = params.cancelled_url;

  const res = await fetch(`${baseUrl}/v1/invoice`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NOWPayments invoice creation failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<NowPaymentsInvoice>;
}

export async function getPaymentStatus(paymentId: string): Promise<NowPaymentResult> {
  const env = getServerEnv();
  const apiKey = env.NOWPAYMENTS_API_KEY;
  const baseUrl = env.NOWPAYMENTS_API_BASE ?? 'https://api-sandbox.nowpayments.io';

  if (baseUrl.includes('sandbox') && process.env.NODE_ENV === 'production') {
    createScopedLoggerWithContext({ component: 'nowpayments', operation: 'createInvoice' }).error(
      { nowpaymentsBaseUrl: baseUrl },
      'Using sandbox API in production — set NOWPAYMENTS_API_BASE',
    );
  }

  if (!apiKey) {
    throw new Error('NOWPAYMENTS_API_KEY is not configured');
  }

  const res = await fetch(`${baseUrl}/v1/payment/${paymentId}`, {
    headers: { 'x-api-key': apiKey },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NOWPayments payment status fetch failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<NowPaymentResult>;
}

export async function verifyIpnSignature(
  rawBody: string,
  signature: string,
  ipnSecret: string,
): Promise<boolean> {
  try {
    const parsed = JSON.parse(rawBody);
    const sortedBody = JSON.stringify(parsed, sortKeys);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(ipnSecret),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(sortedBody));
    const expected = Buffer.from(sig).toString('hex');
    return timingSafeEqualHex(expected, signature);
  } catch {
    return false;
  }
}

function sortKeys(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
