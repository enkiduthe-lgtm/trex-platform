// Ignore responses belonging to an older selection or a closed view.
export function createRequestGate() {
  let version = 0;
  return {
    begin: () => ++version,
    invalidate: () => { version++; },
    isCurrent: (ticket: number) => ticket === version,
  };
}
// A synchronous guard also prevents duplicate actions before React rerenders.
export function createActionLock() {
  let locked = false;
  return {
    acquire: () => { if (locked) return false; locked = true; return true; },
    release: () => { locked = false; },
    isLocked: () => locked,
  };
}
