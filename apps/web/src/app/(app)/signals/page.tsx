import { listSignals, computeSignalStats } from '@hamafx/ai';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import type { Metadata } from 'next';
import { SignalsDashboard } from './_components/signals-dashboard';

export const metadata: Metadata = { title: 'AI Signals' };
export const revalidate = 60;

export default async function SignalsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [signals, stats] = await Promise.all([
    listSignals(session.user.id, { limit: 50 }),
    computeSignalStats(session.user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-fg">AI Signals</h2>
        <p className="mt-1 text-sm text-fg-subtle">
          Track record of AI directional recommendations.
        </p>
      </div>
      <SignalsDashboard signals={signals} stats={stats} />
    </div>
  );
}
