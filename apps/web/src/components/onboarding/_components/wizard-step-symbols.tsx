import { IconCheck, IconChevronRight } from '@tabler/icons-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { SymbolCatalogRow } from '@hamafx/db';

interface WizardStepSymbolsProps {
  symbolsCatalog: SymbolCatalogRow[];
  selectedSymbols: string[];
  setSelectedSymbols: (symbols: string[]) => void;
  defaultSymbol: string;
  setDefaultSymbol: (symbol: string) => void;
  symbolsError: string | null;
  onNext: () => void;
  onBack: () => void;
}

export function WizardStepSymbols({
  symbolsCatalog,
  selectedSymbols,
  setSelectedSymbols,
  defaultSymbol,
  setDefaultSymbol,
  symbolsError,
  onNext,
  onBack,
}: WizardStepSymbolsProps) {
  return (
    <div className="flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4">
      <div>
        <h2 className="text-xl font-semibold text-fg mb-1">Select Preferred Symbols</h2>
        <p className="text-sm text-fg-subtle">Choose the instruments you want in your default watchlist. Select at least one.</p>
        {symbolsError && <p className="mt-1 text-xs text-danger">{symbolsError}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
        {symbolsCatalog.map((sym) => {
          const active = selectedSymbols.includes(sym.symbol);
          return (
            <button
              key={sym.symbol}
              type="button"
              onClick={() => {
                if (active) {
                  if (selectedSymbols.length > 1) {
                    const updated = selectedSymbols.filter((s) => s !== sym.symbol);
                    setSelectedSymbols(updated);
                    if (defaultSymbol === sym.symbol && updated.length > 0) {
                      setDefaultSymbol(updated[0]!);
                    }
                  } else {
                    toast.error('Select at least one symbol');
                  }
                } else {
                  setSelectedSymbols([...selectedSymbols, sym.symbol]);
                }
              }}
              className={`text-left rounded-sm border p-4 transition-all hover:bg-bg-elev-2 flex items-center justify-between cursor-pointer relative ${
                active
                  ? 'border-border bg-bg-elev-1 ring-1 ring-fg'
                  : 'border-border bg-bg-elev-1 hover:border-fg-muted'
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-mono font-semibold text-fg text-sm sm:text-base">{sym.symbol}</span>
                <span className="text-xs text-fg-subtle">{sym.name} ({sym.category})</span>
              </div>
              <div className={`size-5 rounded-sm border flex items-center justify-center transition-colors ${
                active ? 'bg-fg border-border text-black' : 'border-border bg-bg-elev-1'
              }`}>
                {active && <IconCheck className="size-3.5 stroke-[3]" />}
              </div>
            </button>
          );
        })}
      </div>

      {selectedSymbols.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-fg">Default Chart Symbol</label>
          <select
            className="h-10 w-full rounded-sm border border-border bg-bg-elev-1 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-fg cursor-pointer"
            value={defaultSymbol}
            onChange={(e) => setDefaultSymbol(e.target.value)}
          >
            {selectedSymbols.map((sym) => (
              <option key={sym} value={sym}>
                {sym}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-4">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" onClick={onNext} disabled={selectedSymbols.length === 0}>
          Continue <IconChevronRight className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}
