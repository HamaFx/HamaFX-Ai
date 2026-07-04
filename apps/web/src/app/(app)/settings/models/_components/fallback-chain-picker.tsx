'use client';

import { useState, useTransition } from 'react';
import {IconPlus, IconTrash, IconGripVertical, IconShieldAlert, IconLoader2} from '@tabler/icons-react';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Button } from '@/components/ui/button';
import { withCsrf } from '@/lib/csrf';
import type { ProviderMeta } from '@hamafx/shared';


interface FallbackChainPickerProps {
  initialChain: string[];
  configuredProviders: ProviderMeta[];
}

function SortableItem({
  id,
  index,
  displayName,
  disabled,
  onRemove,
}: {
  id: string;
  index: number;
  displayName: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-3 border bg-bg-elev-2 rounded-sm p-2.5 transition-all ${
        isDragging
          ? 'border-border shadow-lg z-10 opacity-90'
          : 'border-border hover:border-border'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          className="size-6 flex items-center justify-center text-fg-muted hover:text-fg cursor-grab active:cursor-grabbing touch-none shrink-0"
          aria-label={`Drag to reorder ${displayName}`}
          {...attributes}
          {...listeners}
        >
          <IconGripVertical className="size-3.5" />
        </button>
        <span className="text-caption font-semibold bg-bg-elev-3 border border-border size-5 rounded-sm inline-flex items-center justify-center text-fg-muted shrink-0">
          {index + 1}
        </span>
        <span className="text-sm font-medium text-fg truncate">{displayName}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        disabled={disabled}
        className="size-7 p-0 flex items-center justify-center text-bear hover:bg-bear/10 hover:text-bear shrink-0"
        aria-label={`Remove ${displayName} from chain`}
      >
        <IconTrash className="size-3.5" />
      </Button>
    </div>
  );
}

export function FallbackChainPicker({
  initialChain,
  configuredProviders,
}: FallbackChainPickerProps) {
  const [chain, setChain] = useState<string[]>(initialChain);
  const [pending, startTransition] = useTransition();
  const [selectedToAdd, setSelectedToAdd] = useState<string>('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
      } catch {
        toast.error('Failed to update fallback chain');
        setChain(chain);
      }
    });
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = chain.indexOf(String(active.id));
    const newIndex = chain.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newChain = arrayMove(chain, oldIndex, newIndex);
    saveChain(newChain);
  };

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

  const availableToAdd = configuredProviders.filter(
    (p) => !chain.includes(p.id)
  );

  return (
    <div className="border border-border bg-bg-elev-1 rounded-sm p-4 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg flex items-center gap-1.5">
          <IconShieldAlert className="size-4 text-fg" />
          Provider Fallback Chain
        </span>
        <span className="text-caption text-fg-subtle">
          Drag to reorder. Configure the order in which providers are tried if your primary choice encounters a rate limit, timeout, or upstream failure.
        </span>
      </div>

      {chain.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={chain}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {chain.map((providerId, index) => {
                const provider = configuredProviders.find((p) => p.id === providerId);
                const displayName = provider?.displayName ?? providerId;
                return (
                  <SortableItem
                    key={providerId}
                    id={providerId}
                    index={index}
                    displayName={displayName}
                    disabled={pending}
                    onRemove={() => handleRemove(index)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="text-center py-6 border border-dashed border-border bg-bg-elev-2/40 rounded-sm text-caption text-fg-subtle">
          No fallback chain configured. If a model call fails, the request will immediately fail.
        </div>
      )}

      {availableToAdd.length > 0 && (
        <div className="flex items-center gap-2 mt-1">
          <select
            value={selectedToAdd}
            onChange={(e) => setSelectedToAdd(e.target.value)}
            disabled={pending}
            aria-label="Select a provider to add to fallback chain"
            className="flex-1 appearance-none border border-border bg-bg-elev-2 text-fg rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fg disabled:opacity-60"
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
              <IconLoader2 className="size-3.5 animate-spin" />
            ) : (
              <IconPlus className="size-3.5 mr-1" />
            )}
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
