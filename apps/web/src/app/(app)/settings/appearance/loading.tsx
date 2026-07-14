import { SkeletonCard } from '@/components/ui/skeleton';

export default function AppearanceLoading() {
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <SkeletonCard className="h-48" lines={4} />
    </div>
  );
}
