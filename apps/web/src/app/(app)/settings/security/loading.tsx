import { SkeletonCard } from '@/components/ui/skeleton';

export default function SecurityLoading() {
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} className="h-40" lines={4} />
      ))}
    </div>
  );
}
