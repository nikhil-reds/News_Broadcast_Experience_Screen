const DEMO_TIMER_KEY = "news-simulation:demo-ends-at";
const DEMO_TIMER_EVENT = "news-simulation:demo-timer-changed";

export function readDemoDeadline(): number | null {
  const stored = window.localStorage.getItem(DEMO_TIMER_KEY);
  if (stored === null) return null;
  const deadline = Number(stored);
  return Number.isFinite(deadline) && deadline > 0 ? deadline : null;
}

export function readServerDemoDeadline(): null {
  return null;
}

export function writeDemoDeadline(deadline: number | null) {
  if (deadline === null) {
    window.localStorage.removeItem(DEMO_TIMER_KEY);
  } else {
    window.localStorage.setItem(DEMO_TIMER_KEY, String(deadline));
  }
  window.dispatchEvent(new Event(DEMO_TIMER_EVENT));
}

export function subscribeToDemoDeadline(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.storageArea === window.localStorage && (event.key === DEMO_TIMER_KEY || event.key === null)) {
      onChange();
    }
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(DEMO_TIMER_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(DEMO_TIMER_EVENT, onChange);
  };
}
