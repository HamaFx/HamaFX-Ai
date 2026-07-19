import { IconCheck } from '@tabler/icons-react';

interface WizardStepperProps {
  step: number;
}

export function WizardStepper({ step }: WizardStepperProps) {
  return (
    <div className="mb-4 flex items-center justify-between" role="list" aria-label="Setup progress">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-2" role="listitem">
          <div
            aria-current={step === i ? 'step' : undefined}
            aria-label={`Step ${i}: ${['Profile', 'Trading Style', 'Symbols', 'AI Provider', 'Review'][i - 1]}`}
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
  );
}
