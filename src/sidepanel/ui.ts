/*
 * Small DOM helpers shared by the side panel's parts. Everything here builds elements with
 * `textContent` only: email content is attacker-controlled and must never become markup.
 */
import { revealOverrides } from '../rules/unicode';

/** The icons in `icons/`, drawn through CSS masks (see `.icon` in style.css). */
export type IconName =
  | 'shield-check'
  | 'refresh'
  | 'lock'
  | 'cloud'
  | 'cloud-up'
  | 'bulb'
  | 'info'
  | 'check'
  | 'cross'
  | 'alert'
  | 'chevron-down'
  | 'arrow-left'
  | 'download'
  | 'device'
  | 'eye-off'
  | 'dot'
  | 'dots'
  | 'minus';

/** An element with a class and, optionally, text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * Puts email content into an element. Only as text, and direction overrides are shown as
 * `<U+202E>`, so "moc.lapyap" is not displayed as "paypal.com" in the panel either.
 */
export function setText(element: HTMLElement, text: string): void {
  element.textContent = revealOverrides(text);
}

/** A decorative icon (hidden from screen readers; the text next to it says the same). */
export function icon(name: IconName, className = ''): HTMLSpanElement {
  const span = el('span', className ? `icon ${className}` : 'icon');
  span.dataset.icon = name;
  span.setAttribute('aria-hidden', 'true');
  return span;
}

/** "1.4 s": a duration in seconds with one decimal. */
export const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** "2:14": elapsed time as minutes and seconds, for waits without a known end. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Counts elapsed time in `element` until the returned function is called, which clears it. The
 * counter sits next to a live region, not in it, so a screen reader does not announce every second.
 */
export function countElapsed(
  element: HTMLElement,
  format: (ms: number) => string = clock,
): () => void {
  const start = performance.now();
  const show = (): void => {
    element.textContent = format(performance.now() - start);
  };
  show();
  const timer = setInterval(show, 1000);
  return () => {
    clearInterval(timer);
    element.textContent = '';
  };
}
