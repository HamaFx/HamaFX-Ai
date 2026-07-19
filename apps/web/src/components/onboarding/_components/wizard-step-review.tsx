import { IconBolt, IconRobot, IconUser } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import type { ProviderMeta } from '@hamafx/shared';
import type { TradingStyle } from './wizard-types';

interface WizardStepReviewProps {
  name: string;
  timezone: string;
  tradingStyle: TradingStyle;
  selectedSymbols: string[];
  defaultSymbol: string;
  selectedProvider: string | null;
  providers: ProviderMeta[];
  isSubmitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

export function WizardStepReview({
  name,
  timezone,
  tradingStyle,
  selectedSymbols,
  defaultSymbol,
  selectedProvider,
  providers,
  isSubmitting,
  onBack,
  onSubmit,
}: WizardStepReviewProps) {
  return (
    <div className="flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4">
      <div>
        <h2 className="text-xl font-semibold text-fg mb-1">Review & Complete</h2>
        <p className="text-sm text-fg-subtle">
          Here is what we will configure for you:
        </p>
      </div>
      <ul className="list-disc list-inside text-sm text-fg space-y-1.5 border border-border bg-bg-elev-2 rounded-sm p-4">
        <li>Display name: <span className="text-fg-subtle">{name || '—'}</span></li>
        <li>Timezone: <span className="text-fg-subtle">{timezone}</span></li>
        <li>Trading style: <span className="text-fg-subtle capitalize">{tradingStyle.replace('_', ' ')}</span></li>
        <li>Watchlist: <span className="text-fg-subtle">{selectedSymbols.join(', ')}</span></li>
        <li>Default chart symbol: <span className="text-fg-subtle">{defaultSymbol}</span></li>
        <li>
          AI provider:{' '}
          <span className="text-fg-subtle">
            {selectedProvider
              ? `${providers.find((p) => p.id === selectedProvider)?.displayName} (key saved)`
              : 'skipped — set up later'}
          </span>
        </li>
      </ul>

      {/* Sample chat preview */}
      <details className="border border-border rounded-sm p-3">
        <summary className="cursor-pointer text-sm text-fg-muted hover:text-fg">
          Try a sample chat
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs text-fg-subtle">
            A preview of what HamaFX-Ai can do. After setup, you will be able to ask about any symbol.
          </p>
          <div className="flex flex-col gap-2 bg-bg-elev-2 rounded-sm p-3">
            <div className="flex items-start gap-2">
              <div className="rounded-sm bg-bg-elev-3 p-1.5 mt-0.5">
                <IconUser className="size-3 text-fg" />
              </div>
              <div className="flex-1 text-xs text-fg">
                How is XAUUSD looking?
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="rounded-sm bg-bg-elev-2 p-1.5 mt-0.5">
                <IconRobot className="size-3 text-fg" />
              </div>
              <div className="flex-1 text-xs text-fg leading-[1.4] space-y-1">
                <p>
                  <span className="text-bull font-medium">XAUUSD</span> is showing mixed signals
                  on the 1H:
                </p>
                <ul className="list-disc list-inside text-fg-subtle">
                  <li>Price consolidating above <span className="text-fg tabular-nums">$2,650</span> support</li>
                  <li>RSI at 54 — neutral</li>
                  <li>MACD histogram flattening — momentum fading</li>
                </ul>
                <p>
                  Bias: <span className="text-bear font-medium">Bearish below $2,640</span> ·
                  Key resistance at              <span className="tabular-nums">$2,680</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </details>

      <div className="flex gap-4">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button
          className="flex-1"
          onClick={onSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          <IconBolt className="mr-1 size-4" /> Finish Setup
        </Button>
      </div>
    </div>
  );
}
