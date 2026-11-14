import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The storefront widget's script, run as its deferred tag in
 * membership_widget.liquid runs it: once per page load.
 *
 * A run leaves things that outlive a test's DOM: listeners on the document,
 * a MutationObserver in the theme editor, and window.rewardsProWidget, the
 * guard that makes any later run hand over to the first run's code. Left in
 * place, every test after the first would reuse the first test's run, and a
 * change to what the script sets up at load would go untested. So each run
 * notes what it adds, and unloadWidgetScript() takes it all away again:
 * call it after each test, and the next test is a fresh page load.
 */

const script = readFileSync(resolve(__dirname, "../../../extensions/rewards-widget/assets/rewards-widget.js"), "utf8");

type Added = { type: string; listener: EventListenerOrEventListenerObject; options?: boolean | AddEventListenerOptions };
const listeners: Added[] = [];
const observers: MutationObserver[] = [];

/** Runs the script once, noting the document listeners and observers it adds. */
export function runWidgetScript(): void {
  const add = EventTarget.prototype.addEventListener;
  Object.defineProperty(document, "addEventListener", {
    configurable: true,
    value(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
      listeners.push({ type, listener, options });
      add.call(document, type, listener, options);
    },
  });
  // A test may have taken MutationObserver away (vi.stubGlobal); then there is nothing to note
  const Real = globalThis.MutationObserver as typeof MutationObserver | undefined;
  const own = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  if (typeof Real === "function") {
    class Noted extends Real {
      constructor(callback: MutationCallback) {
        super(callback);
        observers.push(this);
      }
    }
    Object.defineProperty(globalThis, "MutationObserver", { configurable: true, writable: true, value: Noted });
  }
  try {
    new Function(script)();
  } finally {
    Reflect.deleteProperty(document, "addEventListener");
    if (typeof Real === "function") {
      if (own) Object.defineProperty(globalThis, "MutationObserver", own);
      else Reflect.deleteProperty(globalThis, "MutationObserver");
    }
  }
}

/** The types of the document listeners the runs since the last unload added, one per listener. */
export const widgetListenerTypes = (): string[] => listeners.map((added) => added.type);

/** How many MutationObservers the runs since the last unload made. */
export const widgetObserverCount = (): number => observers.length;

/** Undoes every run since the last unload: its listeners, its observers and its guard. */
export function unloadWidgetScript(): void {
  for (const { type, listener, options } of listeners.splice(0)) document.removeEventListener(type, listener, options);
  for (const observer of observers.splice(0)) observer.disconnect();
  Reflect.deleteProperty(window, "rewardsProWidget");
}
