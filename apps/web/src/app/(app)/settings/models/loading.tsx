import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function ModelsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-12 w-1/3" />
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} className="h-28" lines={3} />
      ))}
    </div>
  );
}
