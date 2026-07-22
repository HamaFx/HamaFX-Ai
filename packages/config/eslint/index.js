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

// Shared ESLint flat config for HamaFX-Ai workspaces.
// Apps and packages extend this by importing from "@hamafx/config/eslint".
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @type {import("eslint").Linter.Config[]} */
export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // Personal-mode + AI-agent friendly rules.
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // P2-9: Merged no-restricted-imports — the first declaration was
      // silently overridden by the second. Both `patterns` and `paths`
      // are now combined in a single rule so deep-relative-import and
      // sub-path enforcement both fire.
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['../../../*', '../../../../*'],
              message:
                'Use path aliases (@/, @shared/, @ai/, @data/, @indicators/, @db/) instead of deep relative imports.',
            },
          ],
          paths: [
            {
              name: '@hamafx/ai',
              importNames: ['runChat', 'createThread', 'listThreads', 'getThread', 'listMessages'],
              message:
                'Prefer sub-path imports — use @hamafx/ai/agent, @hamafx/ai/persistence, etc.',
            },
          ],
        },
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // PF-22 — API route files must import from @/lib/services/*, not from
  // domain packages directly. This enforces the Controller+Service pattern
  // so business logic stays in services, not spread across route handlers.
  {
    files: ['src/app/api/**/route.ts'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: '@hamafx/ai',
              message: 'API routes must import from @/lib/services/* instead of @hamafx/ai directly. Import domain functions through the service layer.',
            },
            {
              name: '@hamafx/data',
              message: 'API routes must import from @/lib/services/* instead of @hamafx/data directly. Import data functions through the service layer.',
            },
            {
              name: '@hamafx/db',
              message: 'API routes must import from @/lib/services/* instead of @hamafx/db directly. Import database functions through the service layer.',
            },
            {
              name: '@hamafx/shared',
              message: 'API routes must import from @/lib/services/* instead of @hamafx/shared directly. Import shared utilities through the service layer.',
            },
          ],
          patterns: [
            {
              group: ['@hamafx/*'],
              message: 'API routes must import from @/lib/services/* instead of @hamafx/* directly.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/coverage/**',
      '**/drizzle/**',
      '**/*.config.{js,mjs,ts}',
      '**/next-env.d.ts',
    ],
  },
];
