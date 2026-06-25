import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function SymbolsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-12 w-1/2" />
      {Array.from({ length: 3 }).map((_, i) => (
        <SkeletonCard key={i} className="h-24" lines={2} />
      ))}
    </div>
  );
}
