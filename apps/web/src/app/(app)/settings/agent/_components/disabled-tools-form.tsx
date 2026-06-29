'use client';

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { Power } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { updateDisabledToolsAction } from '../../actions';
import type { ToolName } from '@hamafx/shared';

interface DisabledToolsFormProps {
  allTools: ToolName[];
  initialDisabledTools: string[];
}

export function DisabledToolsForm({
  allTools,
  initialDisabledTools,
}: DisabledToolsFormProps) {
  type FormState = { ok: boolean; error?: string };
  const [state, formAction, pending] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const disabled = formData.getAll('disabledTool') as string[];
      const res = await updateDisabledToolsAction(disabled);
      return res.ok
        ? { ok: true }
        : { ok: false, error: res.error || 'Unknown error' };
    },
    { ok: false },
  );

  useEffect(() => {
    if (state.ok) {
      toast.success('Disabled tools updated successfully');
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state.ok, state.error]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="border border-divider bg-bg-elev-1 rounded-lg overflow-hidden">
        {allTools.map((toolName) => {
          const isDisabled = initialDisabledTools.includes(toolName);
          return (
            <label
              key={toolName}
              className="flex items-center gap-3 px-3 py-2.5 border-b border-divider/60 last:border-b-0 hover:bg-bg-elev-2/20 cursor-pointer select-none transition-colors"
            >
              <input
                type="checkbox"
                name="disabledTool"
                value={toolName}
                defaultChecked={isDisabled}
                className="size-4 accent-brand rounded border-divider cursor-pointer"
              />
              <Power className={`size-3.5 shrink-0 ${isDisabled ? 'text-bear' : 'text-bull'}`} />
              <div className="flex flex-col min-w-0">
                <code className="text-fg text-xs font-semibold font-mono">{toolName}</code>
              </div>
              <span className="ml-auto text-xs font-medium uppercase tracking-wider text-fg-subtle">
                {isDisabled ? 'Disabled' : 'Enabled'}
              </span>
            </label>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending} className="min-w-[120px]">
          Save Changes
        </Button>
      </div>
    </form>
  );
}
