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

// PF-23 — Worker tenant partitioning.
//
// In single-worker deployments, all tenants are processed by one VM.
// When scaling horizontally, each worker instance can claim a subset
// of tenants to avoid duplicated work. A worker's partition is
// determined by `WORKER_PARTITION` and `WORKER_PARTITIONS_TOTAL` env
// vars — e.g. `WORKER_PARTITION=2 WORKER_PARTITIONS_TOTAL=4` means
// "I am partition 2 of 4, processing tenants whose ID hash mod 4 == 2."
//
// Usage:
//   if (tenantRouter.isMyTenant(userId)) {
//     await processTenant(userId);
//   }
//
// When no partitioning is configured (single-worker), isMyTenant()
// always returns true (backward-compatible default).

import { createHash } from 'node:crypto';

/**
 * PF-23 — Route tenant work across worker instances.
 *
 * Tenant assignment is deterministic: `hash(tenantId) % totalPartitions`.
 * This lets any worker independently decide whether it owns a tenant
 * without coordination (no Redis, no database lock needed).
 */
export class TenantRouter {
  /** 0-based partition index for THIS worker (e.g. 0, 1, 2, 3). */
  readonly partition: number;
  /** Total number of partitions configured (e.g. 4). */
  readonly totalPartitions: number;
  /** True when single-worker mode (no actual partitioning). */
  readonly isSingleWorker: boolean;

  constructor() {
    const rawPartition = process.env.WORKER_PARTITION;
    const rawTotal = process.env.WORKER_PARTITIONS_TOTAL;

    if (!rawPartition || !rawTotal) {
      this.partition = 0;
      this.totalPartitions = 1;
      this.isSingleWorker = true;
    } else {
      this.partition = Math.max(0, parseInt(rawPartition, 10) || 0);
      this.totalPartitions = Math.max(1, parseInt(rawTotal, 10) || 1);
      this.isSingleWorker = false;
    }
  }

  /**
   * Returns true when this worker is responsible for the given tenant.
   * Always returns true in single-worker mode.
   */
  isMyTenant(tenantId: string): boolean {
    if (this.isSingleWorker) return true;
    const hash = createHash('md5').update(tenantId).digest();
    const bucket = hash.readUInt32BE(0) % this.totalPartitions;
    return bucket === this.partition;
  }

  /**
   * Returns the partition bucket for a tenant (0 to totalPartitions-1).
   * Useful for telemetry and debugging.
   */
  tenantBucket(tenantId: string): number {
    if (this.isSingleWorker) return 0;
    const hash = createHash('md5').update(tenantId).digest();
    return hash.readUInt32BE(0) % this.totalPartitions;
  }
}

/** Global singleton — import this in job files to check partition ownership. */
export const tenantRouter = new TenantRouter();
