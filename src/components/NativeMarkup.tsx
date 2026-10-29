import { createElement, useMemo, type ReactNode, type SyntheticEvent } from 'react';

/**
 * Turn existing HTML templates into React DOM nodes. This is an intermediate
 * step towards data-driven JSX: React now owns the screen element tree and
 * events, without executing inline JavaScript or injecting raw HTML into React.
 */
const htmlAttributes: Record<string, string> = {
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  minlength: 'minLength',
  autocomplete: 'autoComplete',
  crossorigin: 'crossOrigin',
  playsinline: 'playsInline',
  srcset: 'srcSet',
  viewbox: 'viewBox',
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'fill-rule': 'fillRule',
  'clip-rule': 'clipRule',
};

const eventAttributes: Record<string, string> = {
  onclick: 'onClick',
  onchange: 'onChange',
  oninput: 'onInput',
  onload: 'onLoad',
  onerror: 'onError',
};

function parseStyle(style: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const declaration of style.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 0) continue;
    const name = declaration.slice(0, separator).trim();
    const value = declaration.slice(separator + 1).trim();
    if (!name || !value) continue;
    const key = name.startsWith('--') ? name : name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    result[key] = value.replace(/\s*!important\s*$/, '');
  }
  return result;
}

function splitArgs(value: string): string[] {
  const result: string[] = [];
  let buffer = '';
  let quote = '';
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (quote) {
      buffer += char;
      if (char === '\\' && index + 1 < value.length) buffer += value[++index];
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
      buffer += char;
    } else if (char === ',') {
      result.push(buffer.trim());
      buffer = '';
    } else {
      buffer += char;
    }
  }
  if (buffer.trim()) result.push(buffer.trim());
  return result;
}

function argument(token: string, event: SyntheticEvent<Element>): unknown {
  if (token === 'event') return event;
  if (token === 'this') return event.currentTarget;
  if (token === 'this.value') return (event.currentTarget as HTMLInputElement).value;
  if (token === 'true') return true;
  if (token === 'false') return false;
  if (token === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(token)) return Number(token);
  if (/^'[^']*'$/.test(token) || /^"[^"]*"$/.test(token)) {
    return token.slice(1, -1).replace(/\\(['"\\])/g, '$1');
  }
  throw new Error(`Unsupported UI event argument: ${token}`);
}

/** Dispatch only known named global handlers; never evaluate generated code. */
function dispatch(command: string, event: SyntheticEvent<Element>): void {
  for (const statement of command.split(';').map(item => item.trim()).filter(Boolean)) {
    if (statement === 'event.preventDefault()') { event.preventDefault(); continue; }
    if (statement === 'this.remove()') { event.currentTarget.remove(); continue; }
    if (statement === "this.previousElementSibling.style.display='none'") {
      const sibling = event.currentTarget.previousElementSibling as HTMLElement | null;
      if (sibling) sibling.style.display = 'none';
      continue;
    }
    if (statement === 'if(event.target===this)closeModal()') {
      if (event.target === event.currentTarget) window.closeModal?.();
      continue;
    }
    const match = statement.match(/^([A-Za-z][A-Za-z0-9_]*)\((.*)\)$/);
    if (!match) throw new Error(`Unsupported UI event statement: ${statement}`);
    const fn = (window as unknown as Record<string, unknown>)[match[1]];
    if (typeof fn !== 'function') throw new Error(`Missing UI event handler: ${match[1]}`);
    const args = match[2].trim() ? splitArgs(match[2]).map(value => argument(value, event)) : [];
    (fn as (...params: unknown[]) => unknown)(...args);
  }
}

function reactNode(node: Node, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  const props: Record<string, unknown> = { key };

  for (const { name, value } of Array.from(element.attributes)) {
    const lower = name.toLowerCase();
    if (eventAttributes[lower]) {
      props[eventAttributes[lower]] = (event: SyntheticEvent<Element>) => dispatch(value, event);
    } else if (lower === 'style') {
      props.style = parseStyle(value);
    } else if (lower === 'value' && tag === 'input') {
      props.defaultValue = value;
    } else if (lower === 'checked' && tag === 'input') {
      props.defaultChecked = true;
    } else if (lower === 'selected' && tag === 'option') {
      // Selection belongs on the React <select>, not its <option> nodes.
      continue;
    } else if (['disabled', 'required', 'hidden', 'multiple', 'readOnly', 'open', 'controls', 'autoplay', 'loop', 'muted'].includes(lower)) {
      props[htmlAttributes[lower] || lower] = true;
    } else {
      props[htmlAttributes[lower] || name] = value;
    }
  }

  if (tag === 'select') {
    const selected = element.querySelector('option[selected]');
    if (selected) props.defaultValue = selected.getAttribute('value') ?? selected.textContent ?? '';
  }
  if (tag === 'textarea') {
    props.defaultValue = element.textContent ?? '';
    return createElement('textarea', props);
  }

  const children = Array.from(element.childNodes).map((child, index) => reactNode(child, `${key}.${index}`));
  return createElement(tag, props, ...children);
}

export function NativeMarkup({ markup }: { markup: string }) {
  const nodes = useMemo(() => {
    const template = document.createElement('template');
    template.innerHTML = markup;
    return Array.from(template.content.childNodes).map((child, index) => reactNode(child, String(index)));
  }, [markup]);
  return <>{nodes}</>;
}

declare global {
  interface Window {
    closeModal?: () => void;
  }
}
