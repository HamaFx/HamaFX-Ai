import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function AgentLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-12 w-2/3" />
      {Array.from({ length: 3 }).map((_, i) => (
        <SkeletonCard key={i} className="h-48" lines={5} />
      ))}
    </div>
  );
}
