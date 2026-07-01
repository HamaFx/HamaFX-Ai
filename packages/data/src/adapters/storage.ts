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

export interface SupabaseStorageEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export interface StorageObjectInfo {
  name: string;
}

function storageBaseUrl(env: SupabaseStorageEnv): string {
  return env.SUPABASE_URL.replace(/\/+$/, '');
}

function storageHeaders(env: SupabaseStorageEnv): Record<string, string> {
  return {
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  };
}

export async function listStorageObjects(
  env: SupabaseStorageEnv,
  bucket: string,
  prefix: string,
): Promise<StorageObjectInfo[]> {
  const res = await fetch(`${storageBaseUrl(env)}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: storageHeaders(env),
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '<no body>');
    throw new Error(`Supabase Storage list failed: HTTP ${res.status} — ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as unknown;
  return Array.isArray(json) ? (json as StorageObjectInfo[]) : [];
}

export async function deleteStorageObjects(
  env: SupabaseStorageEnv,
  bucket: string,
  paths: string[],
): Promise<void> {
  const res = await fetch(`${storageBaseUrl(env)}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: storageHeaders(env),
    body: JSON.stringify({ prefixes: paths }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '<no body>');
    throw new Error(`Supabase Storage delete failed: HTTP ${res.status} — ${detail.slice(0, 200)}`);
  }
}
