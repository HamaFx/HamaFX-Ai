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

import { useActionState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash } from 'lucide-react';
import { addSymbolAction, removeSymbolAction } from '../actions';
import { toast } from 'sonner';

interface SymbolItem {
  symbol: string;
}

interface SymbolsFormProps {
  initialSymbols: SymbolItem[];
}

export function SymbolsForm({ initialSymbols }: SymbolsFormProps) {
  const [addState, addAction, addPending] = useActionState(async (prevState: { error: string; ok: boolean }, formData: FormData) => {
    const res = await addSymbolAction(formData);
    if (res.ok) {
      // Clear input manually if successful (since action is done)
      const form = document.querySelector('form[data-symbol-form]') as HTMLFormElement;
      if (form) form.reset();
    }
    return { error: res.error || '', ok: res.ok };
  }, { error: '', ok: false });

  useEffect(() => {
    if (addState.ok) {
      toast.success('Symbol added to watchlist');
    } else if (addState.error) {
      toast.error(addState.error);
    }
  }, [addState.ok, addState.error]);

  const handleRemove = async (symbol: string) => {
    const fd = new FormData();
    fd.append('symbol', symbol);
    const res = await removeSymbolAction(fd);
    if (res.ok) {
      toast.success('Symbol removed from watchlist');
    } else {
      toast.error(res.error || 'Failed to remove symbol');
    }
  };

  return (
    <div className="border border-divider bg-bg-elev-1 rounded-lg p-4 flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {initialSymbols.map((s) => (
          <li key={s.symbol} className="flex items-center justify-between p-3 rounded-md bg-surface border border-surface-elevated">
            <span className="font-mono text-sm font-medium">{s.symbol}</span>
            <Button
              variant="ghost"
              type="button"
              onClick={() => handleRemove(s.symbol)}
              className="h-8 w-8 p-0 text-fg-subtle hover:text-bear"
            >
              <Trash className="size-4" />
            </Button>
          </li>
        ))}
        {initialSymbols.length === 0 && (
          <div className="text-center p-4 text-sm text-fg-subtle">
            Your watchlist is empty.
          </div>
        )}
      </ul>

      <form action={addAction} data-symbol-form className="flex gap-2 pt-2 border-t border-surface-elevated mt-2">
        <Input name="symbol" placeholder="e.g. BTCUSD" className="flex-1" required />
        <Button type="submit" loading={addPending}>Add Symbol</Button>
      </form>
    </div>
  );
}
