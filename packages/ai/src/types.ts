/**
 * Copyright 2026 Kestrel
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

// PF-11 — Shared types for the @kestrel/ai package.
//
// Breaking the type-only cycle between agent.ts and tool-context.ts
// (and any future cross-module references) by moving shared types
// here. Modules that need these types import from './types' instead
// of from agent.ts, which eliminates the circular dependency risk.
//
// Rule: anything imported by two or more modules in this package
// should live here.


