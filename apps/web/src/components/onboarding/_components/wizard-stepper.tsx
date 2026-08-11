import { IconCheck } from '@tabler/icons-react';

interface WizardStepperProps {
  step: number;
}

const STEP_LABELS = ['Profile', 'Trading Style', 'Symbols', 'AI Provider', 'Review'] as const;

export function WizardStepper({ step }: WizardStepperProps) {
  const currentLabel = STEP_LABELS[step - 1] ?? STEP_LABELS[0];

  return (
    <div
      className="mb-5 flex flex-col gap-2"
      role="group"
      aria-label={`Setup progress: step ${step} of ${STEP_LABELS.length}, ${currentLabel}`}
    >
      <div className="flex items-center justify-between" role="list" aria-label="Setup steps">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-2"
            role="listitem"
            aria-current={step === i ? 'step' : undefined}
            aria-label={`Step ${i}: ${STEP_LABELS[i - 1]}`}
          >
            <div
              aria-hidden="true"
            className={`flex size-8 items-center justify-center rounded-sm text-sm font-semibold transition-colors ${
              step >= i ? 'bg-fg text-black' : 'bg-bg-elev-1 text-fg-subtle'
            }`}
          >
              {step > i ? <IconCheck className="size-4" /> : i}
            </div>
            {i < 5 && (
              <div
                className={`h-px w-8 sm:w-16 transition-colors ${
                  step > i ? 'bg-fg' : 'bg-bg-elev-2'
                }`}
              />
            )}
          </div>
        ))}
      </div>
      <p className="text-fg-muted text-caption sm:hidden" aria-live="polite">
        Step {step} of {STEP_LABELS.length} · <span className="text-fg">{currentLabel}</span>
      </p>
    </div>
  );
}
