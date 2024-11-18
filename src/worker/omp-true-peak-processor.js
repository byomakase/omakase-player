function m(o, r) {
  const t = [], i = 1 / (4 * r), s = 1 - Math.ceil(o / 2), l = Math.floor(o / 2);
  for (let e = s; e <= l; e++) {
    const a = 0.54 + 0.46 * Math.cos(2 * Math.PI * e / o);
    let n = 0;
    e == 0 ? n = 2 * i : n = Math.sin(2 * Math.PI * i * e) / (Math.PI * e), n = a * n * r, t.push(n);
  }
  return t;
}
function g(o, r, t) {
  const i = [];
  for (let s = 0; s < t; s += 1) {
    let l = 0, e = 0;
    for (let a = s; a < r.length; a += t)
      e += r[a] * o[o.length - 1 - l], l += 1;
    i.push(e);
  }
  return i;
}
function M(o, r, t, i) {
  return o.map((s, l) => {
    const e = r[l];
    let a = 0;
    for (let n = 0; n < s.length; n++) {
      const u = s[n];
      e.push(u), e.shift();
      const p = g(e, t, i);
      for (let f = 0; f < p.length; f++) {
        const h = Math.abs(p[f]);
        h > a && (a = h);
      }
    }
    return a;
  });
}
class P extends AudioWorkletProcessor {
  constructor() {
    super(), this.numCoefficients = 33, this.sampleRate = sampleRate, this.upsampleFactor = this.sampleRate > 8e4 ? 2 : 4, this.lpfCoefficients = m(this.numCoefficients, this.upsampleFactor), this.lpfBuffers = [], this.port.postMessage({ type: "message", message: `true peak inited? ${this.sampleRate}` }), this.processCount = 0;
  }
  process(r) {
    const t = r[0];
    if (t.length > this.lpfBuffers.length)
      for (let s = 1; s <= t.length; s += 1)
        s > this.lpfBuffers.length && this.lpfBuffers.push(new Array(this.numCoefficients).fill(0));
    const i = M(t, this.lpfBuffers, this.lpfCoefficients, this.upsampleFactor);
    return this.port.postMessage({ type: "peaks", peaks: i }), this.processCount % 100 === 0 && this.port.postMessage({ type: "message", message: this.lpfBuffers }), this.processCount += 1, !0;
  }
}
const c = "omp-true-peak-processor";
try {
  registerProcessor(c, P);
} catch {
  console.info(`Failed to register ${c}. This probably means it was already registered.`);
}
