function inertTimer(callback) {
  let current = callback;
  return {
    restart(next) {
      current = next;
    },
    stop() {
      current = null;
    },
    get active() {
      return current !== null;
    },
  };
}

module.exports = {
  now: () => Date.now(),
  timer: inertTimer,
  timerFlush: () => undefined,
  timeout: inertTimer,
  interval: inertTimer,
};
