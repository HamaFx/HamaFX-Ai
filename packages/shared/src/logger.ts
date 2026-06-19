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

import pino from 'pino';

// Define a default base config for our structured logger
const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  // Use pino-pretty for human-readable logs in development, raw JSON in production
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
  // Automatically inject default context bindings, but omit pid/hostname to save bytes in JSON
  ...(isDevelopment ? { base: null } : {}),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'hashedPassword',
      'email',
      'token',
      'keys',
      'aiApiKeys',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Creates a child logger with scoped context.
 * Useful for attaching `userId` or `threadId` to all subsequent logs in a flow.
 */
export function createScopedLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
