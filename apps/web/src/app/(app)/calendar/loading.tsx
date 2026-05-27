import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function CalendarLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonCard key={i} className="h-20" lines={2} />
      ))}
    </div>
  );
}
