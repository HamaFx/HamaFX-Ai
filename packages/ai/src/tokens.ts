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

// DIP-2 — Typed DI tokens. Single source of truth for the container's
// token↔type mapping. Every register() / resolve() call in packages/ai
// should use these tokens instead of magic strings.
//
// Using token<T>('key') means resolve(token) infers T without a manual
// generic parameter — a typo or wrong type is a compile error.

import { token } from '@hamafx/shared';
import type { LlmClient } from './llm-client';
import type { DbClient } from '@hamafx/db';

export const DB = token<DbClient>('db');
export const LLM_CLIENT = token<LlmClient>('llmClient');
