
import { StatCard } from '@/components/ui/stat-card';
import { TrendingUp, Activity, DollarSign, Clock } from 'lucide-react';
import { cn } from '@/lib/cn';

// Sample data for the dashboard layout
const METRICS = [
  { label: 'Total Equity', value: '$12,450.00', tone: 'fg' as const, icon: <DollarSign />, sparkline: [12000, 12100, 12050, 12200, 12350, 12450] },
  { label: 'Daily P/L', value: '+$150.00', tone: 'bull' as const, icon: <TrendingUp />, sparkline: [0, -50, 20, 80, 120, 150] },
  { label: 'Active Trades', value: '3', tone: 'fg' as const, icon: <Activity /> },
  { label: 'Avg Trade Duration', value: '2h 15m', tone: 'muted' as const, icon: <Clock /> },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6 w-full @container">
      {/* Bento Grid layout using container queries for density */}
      <div className={cn(
        "grid gap-4",
        "grid-cols-2", // Default mobile
        "@3xl:grid-cols-4 @3xl:grid-rows-[auto_1fr]" // Desktop (dense)
      )}>
        {/* Metric Cards - Top Row */}
        {METRICS.map((metric, i) => (
          <div key={i} className="@3xl:col-span-1">
            <StatCard {...metric} />
          </div>
        ))}
        
        {/* Main Chart Area - Takes up more space */}
        <div className="col-span-2 @3xl:col-span-3 @3xl:row-span-2 min-h-[300px] @3xl:min-h-[400px]">
          <div className="card-premium h-full w-full flex flex-col p-4" style={{ contentVisibility: 'auto' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold tracking-tight">Market Overview</h2>
              <span className="text-xs text-fg-muted">XAUUSD</span>
            </div>
            <div className="flex-1 flex items-center justify-center border border-divider/50 rounded-md bg-bg-elev-2/30">
              <span className="text-fg-muted text-sm">Chart Component Placeholder</span>
            </div>
          </div>
        </div>
        
        {/* Recent Activity / News - Side column */}
        <div className="col-span-2 @3xl:col-span-1 @3xl:row-span-2 min-h-[300px]">
          <div className="card-premium h-full w-full flex flex-col p-4" style={{ contentVisibility: 'auto' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold tracking-tight">Recent Activity</h2>
            </div>
            <div className="flex-1 flex flex-col gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-divider/40 last:border-0">
                  <div className="size-2 rounded-full bg-brand mt-1.5" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Trade Closed</span>
                    <span className="text-xs text-fg-muted tabular-nums">+45.2 pips on GBPUSD</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
