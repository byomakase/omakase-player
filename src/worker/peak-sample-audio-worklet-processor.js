//#region src/worker/peak-sample-audio-worklet-processor.ts
var e = class extends AudioWorkletProcessor {
	_alive = !0;
	constructor() {
		super(), this.port.onmessage = (e) => {
			e.data?.type === "dispose" && (this._alive = !1);
		};
	}
	process(e) {
		let n = e[0], r = t(n);
		return this.port.postMessage({
			type: "peaks",
			peaks: r
		}), this._alive;
	}
};
function t(e) {
	return e.map((e) => {
		let t = 0;
		for (let n = 0; n < e.length; n++) {
			let r = Math.abs(e[n]);
			r > t && (t = r);
		}
		return t;
	});
}
try {
	registerProcessor("peak-sample-audio-worklet-processor", e);
} catch {
	console.info("Failed to register peak-sample-audio-worklet-processor. This probably means it was already registered.");
}
//#endregion
