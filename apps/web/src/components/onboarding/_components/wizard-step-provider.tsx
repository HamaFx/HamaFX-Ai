import { IconCheck, IconChevronRight, IconEye, IconEyeOff, IconLoader2 } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProviderInfoDot } from '@/components/ui/provider-info-dot';
import type { ProviderMeta, ProviderPricingTier } from '@hamafx/shared';
import type { TestState } from './wizard-types';

interface WizardStepProviderProps {
  providers: ProviderMeta[];
  selectedProvider: string | null;
  setSelectedProvider: (id: string | null) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  revealed: boolean;
  setRevealed: (revealed: boolean) => void;
  testState: TestState;
  onTestKey: () => void;
  onNext: () => void;
  onBack: () => void;
  onSkipProvider: () => void;
}

function tierLabel(tier: ProviderPricingTier) {
  switch (tier) {
    case 'free': return 'Free tier';
    case 'low': return 'Low cost';
    case 'medium': return 'Paid';
    case 'high': return 'Premium';
  }
}

export function WizardStepProvider({
  providers,
  selectedProvider,
  setSelectedProvider,
  apiKey,
  setApiKey,
  revealed,
  setRevealed,
  testState,
  onTestKey,
  onNext,
  onBack,
  onSkipProvider,
}: WizardStepProviderProps) {
  return (
    <div className="flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4">
      <div>
        <h2 className="text-xl font-semibold text-fg mb-1">Connect an AI Provider</h2>
        <p className="text-sm text-fg-subtle">
          HamaFX-Ai is BYOK (Bring Your Own Key). Pick a provider below and paste
          your API key. You can add more or change providers later in Settings.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
        {providers.map((p) => {
          const selected = selectedProvider === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setSelectedProvider(p.id);
              }}
              className={`text-left rounded-sm border p-3 transition-colors ${
                selected
                  ? 'border-border bg-bg-elev-2 ring-1 ring-fg'
                  : 'border-border bg-bg-elev-1 hover:border-fg-subtle'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm font-medium text-fg">{p.displayName}</div>
                  <ProviderInfoDot provider={p} />
                </div>
                <div className="text-xs text-fg-subtle">{tierLabel(p.pricingTier)}</div>
              </div>
              <div className="mt-1 text-xs text-fg-subtle line-clamp-2">
                {p.description}
              </div>
            </button>
          );
        })}
      </div>

      {selectedProvider && (
        <div className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2">
          <label className="text-sm font-medium text-fg">
            API Key for {providers.find((p) => p.id === selectedProvider)?.displayName}
          </label>
          <div className="relative">
            <Input
              type={revealed ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
              }}
              placeholder={providers.find((p) => p.id === selectedProvider)?.keyHint}
              autoComplete="off"
              spellCheck={false}
              className="pr-20"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRevealed(!revealed)}
                className="p-1 text-fg-subtle hover:text-fg transition-colors"
                aria-label={revealed ? 'Hide key' : 'Show key'}
              >
                {revealed ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={apiKey.trim().length < 8 || testState.kind === 'pending'}
              onClick={onTestKey}
            >
              {testState.kind === 'pending' ? (
                <>
                  <IconLoader2 className="mr-1 size-3 animate-spin" />
                  Testing
                </>
              ) : (
                'Test Connection'
              )}
            </Button>
            {testState.kind === 'ok' && (
              <span className="flex items-center gap-1 text-xs text-success">
                <IconCheck className="size-3" /> Key looks valid
              </span>
            )}
            {testState.kind === 'err' && (
              <span className="text-xs text-danger">{testState.message}</span>
            )}
          </div>
        </div>
      )}

      {!selectedProvider && (
        <p className="text-xs text-fg-subtle">
          Tip: choose a free-tier provider to try things out without spending.
        </p>
      )}

      <div className="flex gap-4">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button
          className="flex-1"
          onClick={onNext}
          disabled={!selectedProvider || apiKey.trim().length < 8}
        >
          Continue <IconChevronRight className="ml-2 size-4" />
        </Button>
      </div>
      <button
        type="button"
        onClick={onSkipProvider}
        className="text-xs text-fg-subtle hover:text-fg transition-colors text-center w-full mt-2"
      >
        Skip for now (configure later in Settings)
      </button>
    </div>
  );
}
