class e extends AudioWorkletProcessor {
  process(r, o, t) {
    return this.port.postMessage(""), !0;
  }
}
try {
  registerProcessor("omp-sync-watchdog-processor", e);
} catch {
  console.info("Failed to register omp-sync-watchdog-processor. This probably means it was already registered.");
}
