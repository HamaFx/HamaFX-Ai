'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconArrowDown, IconArrowUp, IconGripVertical, IconTrash } from '@tabler/icons-react';
import { cn } from '@/lib/cn';

export interface SymbolItem {
  symbol: string;
  name?: string;
  category?: string;
  displayOrder: number;
}

interface SortableSymbolRowProps {
  item: SymbolItem;
  index: number;
  priceMap: Map<string, number>;
  isSelected: boolean;
  onToggleSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  totalItems: number;
}

export function SortableSymbolRow({
  item,
  index,
  priceMap,
  isSelected,
  onToggleSelect,
  onRemove,
  onMove,
  totalItems,
}: SortableSymbolRowProps) {
  const price = priceMap.get(item.symbol);
  const decimals = item.symbol === 'XAUUSD' ? 2 : 5;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.symbol });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center justify-between p-3 rounded-sm border transition-all',
        isDragging
          ? 'border-border shadow-lg z-10 opacity-90 bg-bg-elev-2'
          : isSelected
            ? 'bg-bg-elev-1 border-border shadow-sm'
            : 'bg-bg-elev-1 border-border hover:border-fg-subtle/30',
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          className="size-[44px] -ml-1 flex items-center justify-center rounded-sm text-fg-muted hover:text-fg hover:bg-bg-elev-2 cursor-grab active:cursor-grabbing touch-none shrink-0"
          aria-label={`Drag to reorder ${item.symbol}`}
          {...attributes}
          {...listeners}
        >
          <IconGripVertical className="size-4" />
        </button>
        <label
          htmlFor={`select-${item.symbol}`}
          className="flex items-center justify-center size-[44px] cursor-pointer shrink-0"
        >
          <input
            id={`select-${item.symbol}`}
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(item.symbol)}
            aria-label={`Select ${item.symbol}`}
            className="rounded-sm border-border bg-bg-elev-1 text-fg focus:ring-fg size-4 cursor-pointer"
          />
        </label>
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold text-fg">{item.symbol}</span>
            <span className="text-xs uppercase font-mono px-1 rounded-sm bg-bg-elev-2 text-fg-subtle border border-border shrink-0">
              {item.category}
            </span>
          </div>
          <span className="text-caption text-fg-subtle truncate">{item.name}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="flex flex-col items-end">
          <span className="font-mono text-xs font-semibold text-fg">
            {price !== undefined ? price.toFixed(decimals) : '\u2014'}
          </span>
          {price !== undefined && (
            <span className="text-xs text-fg-muted uppercase tracking-wider">Live</span>
          )}
        </div>

        {/* Arrow buttons — keyboard-only fallback, visually hidden on small screens */}
        <div className="hidden sm:flex items-center h-11 border border-border rounded-sm bg-bg-elev-1">
          <button
            type="button"
            onClick={() => onMove(index, 'up')}
            disabled={index === 0}
            aria-label="Move symbol up"
            className="h-full w-11 flex items-center justify-center text-fg-subtle hover:text-fg disabled:opacity-30 disabled:hover:text-fg-subtle"
          >
            <IconArrowUp className="size-3.5" />
          </button>
          <div className="w-px h-5 bg-divider/60" />
          <button
            type="button"
            onClick={() => onMove(index, 'down')}
            disabled={index === totalItems - 1}
            aria-label="Move symbol down"
            className="h-full w-11 flex items-center justify-center text-fg-subtle hover:text-fg disabled:opacity-30 disabled:hover:text-fg-subtle"
          >
            <IconArrowDown className="size-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onRemove(item.symbol)}
          aria-label={`Remove ${item.symbol} from watchlist`}
          className="size-[44px] flex items-center justify-center text-fg-subtle hover:text-danger hover:bg-danger/10 rounded-sm transition-colors"
        >
          <IconTrash className="size-4" />
        </button>
      </div>
    </div>
  );
}
