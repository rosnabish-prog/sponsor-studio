/** Keyboard shortcuts are stored as stable modifiers plus a single letter or digit. */
export const HOTKEY_PLACEHOLDER = 'Press 1–9, A–Z, Ctrl + key, or Alt + key';

export function normalizeHotkey(value: string | undefined | null): string {
  if (!value) return '';
  const raw = value.trim().toLowerCase().replace(/\s+/g, '');
  const match = /^(?:(ctrl|alt)\+)?([a-z0-9])$/.exec(raw);
  return match ? `${match[1] ? `${match[1]}+` : ''}${match[2]}` : '';
}

export function hotkeyFromKeyboard(event: Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'key' | 'code'>): string {
  if (event.metaKey || event.shiftKey || (event.ctrlKey && event.altKey)) return '';
  const physical = /^Key([A-Z])$/.exec(event.code)?.[1]?.toLowerCase() || /^Digit([0-9])$/.exec(event.code)?.[1];
  const key = /^[a-z0-9]$/i.test(event.key) ? event.key.toLowerCase() : physical;
  return normalizeHotkey(key ? `${event.ctrlKey ? 'ctrl+' : event.altKey ? 'alt+' : ''}${key}` : '');
}

export function displayHotkey(value?: string): string {
  const key = normalizeHotkey(value);
  if (!key) return '';
  const [modifier, letter] = key.includes('+') ? key.split('+') : ['', key];
  return `${modifier ? `${modifier === 'ctrl' ? 'Ctrl' : 'Alt'} + ` : ''}${letter.toUpperCase()}`;
}
