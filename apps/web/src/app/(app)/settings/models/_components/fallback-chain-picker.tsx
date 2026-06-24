'use client';

/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { withCsrf } from '@/lib/csrf';
import type { ProviderMeta } from '@hamafx/shared';
import type { ProviderId } from '@hamafx/shared/encryption';

interface FallbackChainPickerProps {
  initialChain: string[];
  configuredProviders: ProviderMeta[];
}

export function FallbackChainPicker({
  initialChain,
  configuredProviders,
}: FallbackChainPickerProps) {
  const [chain, setChain] = useState<string[]>(initialChain);
  const [pending, startTransition] = useTransition();
  const [selectedToAdd, setSelectedToAdd] = useState<string>('');

  async function saveChain(newChain: string[]) {
    setChain(newChain);
    startTransition(async () => {
      try {
        const res = await fetch('/api/settings/fallback-chain', {
          method: 'PUT',
          ...withCsrf({
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fallbackChain: newChain }),
          }),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        toast.success('Fallback chain updated');
      } catch (err) {
        toast.error('Failed to update fallback chain');
        // Revert to old chain on failure
        setChain(chain);
      }
    });
  }

  const handleAdd = () => {
    if (!selectedToAdd || chain.includes(selectedToAdd)) return;
    const newChain = [...chain, selectedToAdd];
    saveChain(newChain);
    setSelectedToAdd('');
  };

  const handleRemove = (index: number) => {
    const newChain = chain.filter((_, i) => i !== index);
    saveChain(newChain);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newChain = [...chain];
    const temp = newChain[index - 1]!;
    newChain[index - 1] = newChain[index]!;
    newChain[index] = temp;
    saveChain(newChain);
  };

  const handleMoveDown = (index: number) => {
    if (index === chain.length - 1) return;
    const newChain = [...chain];
    const temp = newChain[index + 1]!;
    newChain[index + 1] = newChain[index]!;
    newChain[index] = temp;
    saveChain(newChain);
  };

  // Find remaining configured providers that aren't already in the chain
  const availableToAdd = configuredProviders.filter(
    (p) => !chain.includes(p.id)
  );

  return (
    <div className="border border-divider bg-bg-elev-1 rounded-lg p-4 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg flex items-center gap-1.5">
          <ShieldAlert className="size-4 text-brand" />
          Provider Fallback Chain
        </span>
        <span className="text-caption text-fg-subtle">
          Configure the order in which providers are tried if your primary choice encounters a rate limit, timeout, or upstream failure.
        </span>
      </div>

      {chain.length > 0 ? (
        <div className="flex flex-col gap-2">
          {chain.map((providerId, index) => {
            const provider = configuredProviders.find((p) => p.id === providerId);
            const displayName = provider?.displayName ?? providerId;
            return (
              <div
                key={providerId}
                className="flex items-center justify-between gap-3 border border-divider/60 bg-bg-elev-2 rounded-lg p-2.5 hover:border-divider transition-all"
              >
                <div className="flex items-center gap-2">
                  <span className="text-caption font-semibold bg-bg-elev-3 border border-divider/80 size-5 rounded-full inline-flex items-center justify-center text-fg-muted">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-fg">{displayName}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0 || pending}
                    className="size-7 p-0 flex items-center justify-center"
                    aria-label="Move up"
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === chain.length - 1 || pending}
                    className="size-7 p-0 flex items-center justify-center"
                    aria-label="Move down"
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(index)}
                    disabled={pending}
                    className="size-7 p-0 flex items-center justify-center text-bear hover:bg-bear/10 hover:text-bear"
                    aria-label="Remove from chain"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6 border border-dashed border-divider bg-bg-elev-2/40 rounded-lg text-caption text-fg-subtle">
          No fallback chain configured. If a model call fails, the request will immediately fail.
        </div>
      )}

      {availableToAdd.length > 0 && (
        <div className="flex items-center gap-2 mt-1">
          <select
            value={selectedToAdd}
            onChange={(e) => setSelectedToAdd(e.target.value)}
            disabled={pending}
            className="flex-1 appearance-none border border-divider bg-bg-elev-2 text-fg rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60"
          >
            <option value="" disabled>
              Select a provider to append...
            </option>
            {availableToAdd.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAdd}
            disabled={!selectedToAdd || pending}
            className="shrink-0 h-9"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5 mr-1" />
            )}
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
