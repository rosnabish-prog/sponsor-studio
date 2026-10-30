/** Catalog order is stored as array order and used directly by the tagging studio. */
export type CatalogKind = 'sponsor' | 'event' | 'camera';
export type DropPlacement = 'before' | 'after';

export function reorderById<T extends { id: string }>(
  entries: T[], sourceId: string, targetId: string, placement: DropPlacement = 'before',
): T[] {
  if (sourceId === targetId) return entries;
  const sourceIndex = entries.findIndex(entry => entry.id === sourceId);
  const targetIndex = entries.findIndex(entry => entry.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return entries;
  const reordered = [...entries];
  const [moved] = reordered.splice(sourceIndex, 1);
  const insertionIndex = reordered.findIndex(entry => entry.id === targetId) + (placement === 'after' ? 1 : 0);
  reordered.splice(insertionIndex, 0, moved);
  return reordered.every((entry, index) => entry === entries[index]) ? entries : reordered;
}

/** A copy has its own identity and never inherits a conflicting keyboard shortcut. */
export function copyCatalogEntry<T extends { id: string; name: string; hotkey?: string }>(
  source: T, nextId: string, sameList: boolean,
): T {
  return { ...source, id: nextId, name: sameList ? `${source.name} (copy)` : source.name, hotkey: '' };
}
