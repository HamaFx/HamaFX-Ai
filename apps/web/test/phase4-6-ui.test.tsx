// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ComposerSlashMenu } from '@/components/chat/composer-slash-menu';
import { WizardStepper } from '@/components/onboarding/_components/wizard-stepper';

afterEach(cleanup);

describe('Phase 4–6 UI improvements', () => {
  describe('onboarding stepper', () => {
    it('announces the current setup step and exposes named step indicators', () => {
      render(<WizardStepper step={3} />);

      expect(
        screen.getByRole('group', {
          name: 'Setup progress: step 3 of 5, Symbols',
        }),
      ).toBeTruthy();
      expect(screen.getByLabelText('Step 3: Symbols')).toHaveAttribute('aria-current', 'step');
      expect(screen.getByText(/Step 3 of 5/)).toBeTruthy();
    });
  });

  describe('slash command menu', () => {
    const commands = [
      {
        command: '/chart',
        description: 'Open a chart',
        placeholder: '/chart XAUUSD',
      },
      {
        command: '/settings',
        description: 'Open settings',
        placeholder: '/settings',
      },
    ] as const;

    it('provides an accessible result count and touch-sized command options', () => {
      render(
        <ComposerSlashMenu
          active
          commands={commands}
          allCommands={commands.map((command) => ({
            command: command.command,
            icon: <span aria-hidden="true">•</span>,
          }))}
          activeIndex={0}
          onSelect={vi.fn()}
          onHover={vi.fn()}
        />,
      );

      expect(screen.getByRole('listbox', { name: 'Slash commands' })).toBeTruthy();
      expect(screen.getByText('2 available')).toHaveAttribute('aria-live', 'polite');
      expect(screen.getAllByRole('option')).toHaveLength(2);
      screen.getAllByRole('option').forEach((option) => {
        expect(option.className).toContain('min-h-11');
      });
    });

    it('does not render when inactive or when there are no matches', () => {
      const props = {
        commands: commands,
        allCommands: [],
        activeIndex: -1,
        onSelect: vi.fn(),
        onHover: vi.fn(),
      } as const;

      const { rerender } = render(<ComposerSlashMenu active={false} {...props} />);
      expect(screen.queryByRole('listbox')).toBeNull();

      rerender(<ComposerSlashMenu active {...props} commands={[]} />);
      expect(screen.queryByRole('listbox')).toBeNull();
    });
  });
});
