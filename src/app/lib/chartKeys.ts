/** Keyboard navigation (roadmap M7-T9): arrows move the selection, Enter edits, Insert/+ adds a bar after. */
export function barKeyAction(
  key: string,
  index: number,
  count: number,
): { type: 'select'; index: number } | { type: 'edit' } | { type: 'insert' } | null {
  const clamp = (i: number) => Math.min(Math.max(0, i), count - 1);
  switch (key) {
    case 'ArrowRight':
      return { type: 'select', index: clamp(index + 1) };
    case 'ArrowLeft':
      return { type: 'select', index: clamp(index - 1) };
    case 'ArrowDown':
      return { type: 'select', index: clamp(index + 4) };
    case 'ArrowUp':
      return { type: 'select', index: clamp(index - 4) };
    case 'Home':
      return { type: 'select', index: 0 };
    case 'End':
      return { type: 'select', index: count - 1 };
    case 'Enter':
      return { type: 'edit' };
    case 'Insert':
    case '+':
      return { type: 'insert' };
    default:
      return null;
  }
}
