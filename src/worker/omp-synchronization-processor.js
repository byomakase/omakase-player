class s extends AudioWorkletProcessor {
  process(o, e, t) {
    return this.port.postMessage(""), !0;
  }
}
try {
  registerProcessor("omp-synchronization-processor", s);
} catch {
  console.info("Failed to register omp-synchronization-processor. This probably means it was already registered.");
}
