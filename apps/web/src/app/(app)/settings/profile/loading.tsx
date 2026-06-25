import { SkeletonCard } from '@/components/ui/skeleton';

export default function ProfileLoading() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <SkeletonCard key={i} className="h-40" lines={4} />
      ))}
    </div>
  );
}
