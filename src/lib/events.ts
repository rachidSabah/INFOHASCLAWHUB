type Callback = (data: any) => void;

class EventBus {
  private listeners: Map<string, Set<Callback>> = new Map();

  emit(event: string, data: any) {
    const cbs = this.listeners.get(event);
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb(data);
        } catch {}
      }
    }
  }

  subscribe(event: string, callback: Callback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      const cbs = this.listeners.get(event);
      if (cbs) {
        cbs.delete(callback);
        if (cbs.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }
}

const globalForEvents = globalThis as unknown as { __eventBus?: EventBus };

export const eventBus: EventBus =
  globalForEvents.__eventBus ??
  (globalForEvents.__eventBus = new EventBus());
