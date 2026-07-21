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
// DIP-2: Tokens can be typed via `Token<T>` so `resolve(token)` infers
// `T` without a manual generic. String tokens still work for backward
// compatibility.
//
// Usage:
//   const DB = token<DbClient>('db');
//   container.register(DB, () => getDb());
//   const db = container.resolve(DB);  // typed as DbClient, no generic
//
// Tests override registrations:
//   container.register(DB, () => mockDb);
//   // ... run tests ...
//   container.clear();

/** A factory function that creates or returns a service instance. */
type Factory<T> = () => T;

/**
 * Typed token for the DI container. Carries a phantom type parameter
 * so `resolve(token)` infers the correct return type without a manual
 * generic parameter.
 *
 * Use the `token<T>(key)` helper to create one.
 */
export interface Token<T> {
  readonly key: string;
  /** Phantom type — never assigned at runtime, only used for inference. */
  readonly _t?: T;
}

/** Create a typed token with key `key`. */
export function token<T>(key: string): Token<T> {
  return { key };
}

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

  /** Register a factory for a typed token. Overwrites any previous registration AND clears the cached instance. */
  register<T>(token: Token<T>, factory: Factory<T>): void;
  /** Register a factory for a string token (backward compatibility). */
  register<T>(token: string, factory: Factory<T>): void;
  register<T>(token: Token<T> | string, factory: Factory<T>): void {
    const key = typeof token === 'string' ? token : token.key;
    this.factories.set(key, factory as Factory<unknown>);
    this.instances.delete(key); // invalidate cached instance on re-registration
  }

  /**
   * Resolve a registered service by typed token. The factory runs on the first
   * call; subsequent calls return the cached instance. Throws if no
   * factory is registered for the token.
   */
  resolve<T>(token: Token<T>): T;
  /** Resolve by string token (backward compatibility). */
  resolve<T>(token: string): T;
  resolve<T>(token: Token<T> | string): T {
    const key = typeof token === 'string' ? token : token.key;
    // Return cached instance if available.
    if (this.instances.has(key)) return this.instances.get(key) as T;

    const factory = this.factories.get(key);
    if (!factory) {
      throw new Error(
        `No service registered for token "${key}". ` +
        `Available tokens: ${[...this.factories.keys()].join(', ') || '(none)'}. ` +
        `Register via container.register('${key}', () => ...).`,
      );
    }

    const instance = factory();
    this.instances.set(key, instance);
    return instance as T;
  }

  /** Check whether a typed token has been registered. */
  has(token: Token<unknown>): boolean;
  /** Check whether a string token has been registered (backward compatibility). */
  has(token: string): boolean;
  has(token: Token<unknown> | string): boolean {
    const key = typeof token === 'string' ? token : token.key;
    return this.factories.has(key);
  }

  /** Remove all registrations and cached instances. Useful for test teardown. */
  clear(): void {
    this.factories.clear();
    this.instances.clear();
  }
}

/** Global singleton container. */
export const container = new Container();
