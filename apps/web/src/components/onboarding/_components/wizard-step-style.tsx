import { IconCheck, IconChevronRight } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import type { TradingStyle } from './wizard-types';

interface WizardStepStyleProps {
  tradingStyle: TradingStyle;
  setTradingStyle: (style: TradingStyle) => void;
  onNext: () => void;
  onBack: () => void;
}

const STYLES = [
  { id: 'scalper' as const, title: '📊 Scalper', timeframe: '1m - 15m', desc: 'Capture fast-paced price action and micro-trends.' },
  { id: 'day_trader' as const, title: '📈 Day Trader', timeframe: '5m - 1H', desc: 'Intraday execution with clean daily closes.' },
  { id: 'swing' as const, title: '🔄 Swing Trader', timeframe: '1H - 4H', desc: 'Hold positions for days to capture large swings.' },
  { id: 'position' as const, title: '🏛 Position Trader', timeframe: 'Daily+', desc: 'Macro trends, long-term fundamentals.' },
];

export function WizardStepStyle({
  tradingStyle,
  setTradingStyle,
  onNext,
  onBack,
}: WizardStepStyleProps) {
  return (
    <div className="flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4">
      <div>
        <h2 className="text-xl font-semibold text-fg mb-1">Choose your Trading Style</h2>
        <p className="text-sm text-fg-subtle">This configures default timeframes and shapes AI suggestions.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {STYLES.map((style) => {
          const active = tradingStyle === style.id;
          return (
            <button
              key={style.id}
              type="button"
              onClick={() => setTradingStyle(style.id)}
              className={`text-left rounded-sm border p-4 transition-all hover:bg-bg-elev-2 flex flex-col gap-1.5 cursor-pointer relative ${
                active
                  ? 'border-border bg-bg-elev-1 ring-1 ring-fg'
                  : 'border-border bg-bg-elev-1 hover:border-fg-muted'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-fg text-sm sm:text-base">{style.title}</span>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-sm bg-bg-elev-2 text-fg-subtle border border-border">
                  {style.timeframe}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-fg-subtle leading-[1.4]">
                {style.desc}
              </p>
              {active && (
                <span className="absolute bottom-3 right-3 text-fg">
                  <IconCheck className="size-4" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex gap-4">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" onClick={onNext}>
          Continue <IconChevronRight className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}
