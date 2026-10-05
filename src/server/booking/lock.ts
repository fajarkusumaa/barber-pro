import 'server-only';

/**
 * An in-process asynchronous mutex lock keyed by a resource string (e.g., `capster:${id}`).
 * Ensures concurrency safety within a single Node.js runtime/instance, complementing
 * PostgreSQL's transaction locks and exclusion constraints across multiple instances.
 */
class KeyedMutex {
  private queues: Map<string, Promise<void>> = new Map();

  async acquire<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const currentLock = this.queues.get(key) ?? Promise.resolve();

    let releaseLock: () => void = () => {};
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.queues.set(key, currentLock.then(() => nextLock));

    try {
      await currentLock;
      return await fn();
    } finally {
      releaseLock();
      if (this.queues.get(key) === nextLock) {
        this.queues.delete(key);
      }
    }
  }
}

export const bookingMutex = new KeyedMutex();
