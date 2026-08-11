import { IconChevronRight } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface WizardStepProfileProps {
  name: string;
  setName: (value: string) => void;
  nameError: string | null;
  timezone: string;
  setTimezone: (value: string) => void;
  onNext: () => void;
}

export function WizardStepProfile({
  name,
  setName,
  nameError,
  timezone,
  setTimezone,
  onNext,
}: WizardStepProfileProps) {
  return (
    <div className="flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4">
      <div>
        <h2 className="text-xl font-semibold text-fg mb-1">Let's get to know you</h2>
        <p className="text-sm text-fg-subtle">Profile settings for your AI trading workspace.</p>
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-fg" htmlFor="onboarding-display-name">Display Name</label>
        <Input
          id="onboarding-display-name"
          value={name}
          onChange={(e) => { setName(e.target.value); }}
          placeholder="Satoshi Nakamoto"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'onboarding-name-error' : undefined}
          autoFocus
        />
        {nameError && <p id="onboarding-name-error" role="alert" className="text-xs text-danger">{nameError}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-fg" htmlFor="onboarding-timezone">Timezone</label>
        <select
          id="onboarding-timezone"
          className="h-11 w-full rounded-sm border border-border bg-bg-elev-1 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-fg cursor-pointer"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {Intl.supportedValuesOf('timeZone').map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>
      <Button className="w-full" onClick={onNext} disabled={!name.trim()}>
        Continue <IconChevronRight className="ml-2 size-4" />
      </Button>
    </div>
  );
}
