// Tiny cross-platform event emitter (no deps).
type Handler = (payload: any) => void;

const listeners: Record<string, Set<Handler>> = {};

export const events = {
  on(event: string, handler: Handler) {
    if (!listeners[event]) listeners[event] = new Set();
    listeners[event].add(handler);
  },
  off(event: string, handler: Handler) {
    listeners[event]?.delete(handler);
  },
  emit(event: string, payload?: any) {
    listeners[event]?.forEach((h) => {
      try { h(payload); } catch {}
    });
  },
};
