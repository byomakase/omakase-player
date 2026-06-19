//#region src/worker/true-peak-audio-worklet-processor.ts
var e = class extends AudioWorkletProcessor {
	_alive = !0;
	sampleRate;
	numCoefficients;
	upsampleFactor;
	lpfCoefficients;
	lpfBuffers;
	processCount;
	constructor() {
		super(), this.port.onmessage = (e) => {
			e.data?.type === "dispose" && (this._alive = !1);
		}, this.numCoefficients = 33, this.sampleRate = sampleRate, this.upsampleFactor = this.sampleRate > 8e4 ? 2 : 4, this.lpfCoefficients = t(this.numCoefficients, this.upsampleFactor), this.lpfBuffers = [], this.port.postMessage({
			type: "message",
			message: `true peak inited? ${this.sampleRate}`
		}), this.processCount = 0;
	}
	process(e) {
		let t = e[0];
		if (t.length > this.lpfBuffers.length) for (let e = 1; e <= t.length; e += 1) e > this.lpfBuffers.length && this.lpfBuffers.push(Array(this.numCoefficients).fill(0));
		let n = r(t, this.lpfBuffers, this.lpfCoefficients, this.upsampleFactor);
		return this.port.postMessage({
			type: "peaks",
			peaks: n
		}), this.processCount % 100 == 0 && this.port.postMessage({
			type: "message",
			message: this.lpfBuffers
		}), this.processCount += 1, this._alive;
	}
};
function t(e, t) {
	let n = [], r = 1 / (4 * t), i = 1 - Math.ceil(e / 2), a = Math.floor(e / 2);
	for (let o = i; o <= a; o++) {
		let i = .54 + .46 * Math.cos(2 * Math.PI * o / e), a = 0;
		a = o == 0 ? 2 * r : Math.sin(2 * Math.PI * r * o) / (Math.PI * o), a = i * a * t, n.push(a);
	}
	return n;
}
function n(e, t, n) {
	let r = [];
	for (let i = 0; i < n; i += 1) {
		let a = 0, o = 0;
		for (let r = i; r < t.length; r += n) o += t[r] * e[e.length - 1 - a], a += 1;
		r.push(o);
	}
	return r;
}
function r(e, t, r, i) {
	return e.map((e, a) => {
		let o = t[a], s = 0;
		for (let t = 0; t < e.length; t++) {
			let a = e[t];
			o.push(a), o.shift();
			let c = n(o, r, i);
			for (let e = 0; e < c.length; e++) {
				let t = Math.abs(c[e]);
				t > s && (s = t);
			}
		}
		return s;
	});
}
try {
	registerProcessor("true-peak-audio-worklet-processor", e);
} catch {
	console.info("Failed to register true-peak-audio-worklet-processor. This probably means it was already registered.");
}
//#endregion
