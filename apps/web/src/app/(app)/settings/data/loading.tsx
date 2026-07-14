import { SkeletonCard } from '@/components/ui/skeleton';

export default function DataLoading() {
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      {Array.from({ length: 2 }).map((_, i) => (
        <SkeletonCard key={i} className="h-48" lines={5} />
      ))}
    </div>
  );
}
