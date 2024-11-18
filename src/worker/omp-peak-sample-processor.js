function p(o) {
  return o.map((r) => {
    let e = 0;
    for (let s = 0; s < r.length; s++) {
      const t = Math.abs(r[s]);
      t > e && (e = t);
    }
    return e;
  });
}
class c extends AudioWorkletProcessor {
  process(r) {
    const e = r[0], s = p(e);
    return this.port.postMessage({ type: "peaks", peaks: s }), !0;
  }
}
const a = "omp-peak-sample-processor";
try {
  registerProcessor(a, c);
} catch {
  console.info(`Failed to register ${a}. This probably means it was already registered.`);
}
