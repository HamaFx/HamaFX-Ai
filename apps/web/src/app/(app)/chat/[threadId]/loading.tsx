// SPDX-License-Identifier: Apache-2.0

import { Skeleton } from '@/components/ui/skeleton';

export default function ThreadLoading() {
  return (
    <div className="flex flex-col gap-4 px-4 pt-4">
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`flex gap-3 ${i % 2 === 1 ? 'justify-end' : ''}`}
          >
            <div className={`flex flex-col gap-2 ${i % 2 === 1 ? 'items-end' : ''}`}
              style={{ maxWidth: '75%' }}
            >
              <Skeleton className={`h-3 rounded-sm ${i % 2 === 1 ? 'w-48' : 'w-36'}`} />
              <Skeleton className={`h-3 rounded-sm ${i % 2 === 1 ? 'w-32' : 'w-52'}`} />
              <Skeleton className="h-3 w-20 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-bg-elev-1 p-4">
        <Skeleton className="h-10 w-full rounded-sm" />
      </div>
    </div>
  );
}
