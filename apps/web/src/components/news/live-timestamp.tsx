'use client';

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

import { useEffect, useState } from 'react';

import { formatRelative } from '@/lib/format';

interface LiveTimestampProps {
  ms: number;
  /** Optional prefix label like "Latest:". */
  prefix?: string;
  className?: string;
}

export function LiveTimestamp({ ms, prefix, className }: LiveTimestampProps) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((v) => v + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className={className}>
      {prefix ? `${prefix} ` : null}
      {formatRelative(ms)}
    </span>
  );
}
