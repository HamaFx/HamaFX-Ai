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

// Dev-only log stream hub.
//
// Captures every log line emitted by the shared pino logger into a ring
// buffer and forwards it to connected Server-Sent Events clients. This is
// intentionally disabled in production and must be opted into via
// `ENABLE_LOG_STREAM=true` in development.

export interface LogStreamClient {
  id: string;
  controller: ReadableStreamDefaultController<string>;
}

export class LogStreamHub {
  private buffer: string[] = [];
  private clients = new Map<string, ReadableStreamDefaultController<string>>();
  private maxSize: number;
  private enabled: boolean;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
    this.enabled = process.env.NODE_ENV === 'development' && process.env.ENABLE_LOG_STREAM === 'true';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Append a raw log line to the ring buffer and broadcast to clients. */
  write(line: string): void {
    if (!this.enabled) return;

    this.buffer.push(line);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }

    for (const [id, controller] of this.clients) {
      try {
        controller.enqueue(`data: ${line}\n\n`);
      } catch {
        // Client disconnected; remove it immediately.
        this.clients.delete(id);
      }
    }
  }

  /** Return the current ring buffer contents. */
  snapshot(): string[] {
    return [...this.buffer];
  }

  /** Register a new SSE client and replay the buffer. */
  subscribe(clientId: string, controller: ReadableStreamDefaultController<string>): void {
    this.clients.set(clientId, controller);
    for (const line of this.buffer) {
      try {
        controller.enqueue(`data: ${line}\n\n`);
      } catch {
        break;
      }
    }
  }

  /** Remove an SSE client. */
  unsubscribe(clientId: string): void {
    this.clients.delete(clientId);
  }
}

export const logStreamHub = new LogStreamHub();
