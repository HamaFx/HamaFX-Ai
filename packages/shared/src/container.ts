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

// P2-3 — Lightweight Dependency Injection container.
//
// Replaces module-level `let _x: T | null = null` singleton patterns
// with a central, testable registry. Services are registered by token
// with a factory function. On first `resolve()`, the factory runs and
// the result is cached.  Subsequent calls return the cached instance.
//
// Usage:
//   container.register('db', () => getDb());
//   container.register('llmClient', () => new VercelLlmClient());
//
//   const db = container.resolve<DbClient>('db');       // cached
//   const client = container.resolve<LlmClient>('llmClient'); // cached
//
// Tests override registrations:
//   container.register('db', () => mockDb);
//   // ... run tests ...
//   container.clear();

/** A factory function that creates or returns a service instance. */
type Factory<T> = () => T;

/**
 * Lightweight DI container.
 *
 * Stores two maps:
 * - factories: token → factory (registered by `register()`)
 * - instances: token → resolved instance (cached by `resolve()`)
 *
 * `clear()` empties both maps for test teardown.
 */
export class Container {
  private readonly factories = new Map<string, Factory<unknown>>();
  private readonly instances = new Map<string, unknown>();

  /** Register a factory for a token. Overwrites any previous registration AND clears the cached instance. */
  register<T>(token: string, factory: Factory<T>): void {
    this.factories.set(token, factory as Factory<unknown>);
    this.instances.delete(token); // invalidate cached instance on re-registration
  }

  /**
   * Resolve a registered service by token. The factory runs on the first
   * call; subsequent calls return the cached instance. Throws if no
   * factory is registered for the token.
   */
  resolve<T>(token: string): T {
    // Return cached instance if available.
    if (this.instances.has(token)) return this.instances.get(token) as T;

    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(
        `No service registered for token "${token}". ` +
        `Available tokens: ${[...this.factories.keys()].join(', ') || '(none)'}. ` +
        `Register via container.register('${token}', () => ...).`,
      );
    }

    const instance = factory();
    this.instances.set(token, instance);
    return instance as T;
  }

  /** Check whether a token has been registered. */
  has(token: string): boolean {
    return this.factories.has(token);
  }

  /** Remove all registrations and cached instances. Useful for test teardown. */
  clear(): void {
    this.factories.clear();
    this.instances.clear();
  }
}

/** Global singleton container. */
export const container = new Container();
