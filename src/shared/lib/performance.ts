export type Operation = "journal.load" | "patient.open" | "patient.save";
const starts = new Map<Operation, number>();

export function startOperation(name: Operation) {
  starts.set(name, performance.now());
}
export function finishOperation(name: Operation) {
  const start = starts.get(name);
  if (start === undefined) return;
  starts.delete(name);
  performance.measure(`efetov.${name}`, { start, end: performance.now() });
}
export function cancelOperation(name: Operation) { starts.delete(name); }

// Available in DevTools. Measurements contain operation names/times, never patient data.
export function performanceSummary() {
  return (["journal.load", "patient.open", "patient.save"] as Operation[]).map(operation => {
    const samples = performance.getEntriesByName(`efetov.${operation}`, "measure").slice(-10);
    const averageMs = samples.length ? samples.reduce((sum, item) => sum + item.duration, 0) / samples.length : null;
    return { operation, repeats: samples.length, averageMs, complete: samples.length === 10,
      passed: samples.length === 10 && averageMs !== null && averageMs <= 2000 };
  });
}
declare global { interface Window { efetovPerformance: { summary: typeof performanceSummary; reset: () => void } } }
window.efetovPerformance = {
  summary: performanceSummary,
  reset: () => {
    starts.clear();
    ["journal.load", "patient.open", "patient.save"].forEach(name => performance.clearMeasures(`efetov.${name}`));
  },
};
