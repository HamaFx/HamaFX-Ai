#!/usr/bin/env node
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

/**
 * Thin entry point for the interactive setup wizard.
 *
 * The implementation lives in scripts/setup/ (index.mjs + lib/ + steps/)
 * so the wizard is modular and testable. This wrapper keeps the
 * documented `node scripts/setup.mjs` invocation working.
 *
 * Usage:  pnpm setup   (or: corepack pnpm setup / node scripts/setup.mjs)
 */
import { main } from './setup/index.mjs';

const code = await main(process.argv.slice(2));
process.exitCode = code;
