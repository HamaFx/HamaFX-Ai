import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function ApiKeysLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-12 w-1/2" />
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} className="h-36" lines={4} />
      ))}
    </div>
  );
}
