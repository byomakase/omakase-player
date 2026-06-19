//#region src/worker/sync-audio-worklet-processor.ts
var e = class extends AudioWorkletProcessor {
	_alive = !0;
	constructor() {
		super(), this.port.onmessage = (e) => {
			e.data?.type === "dispose" && (this._alive = !1);
		};
	}
	process(e, t, n) {
		return this.port.postMessage(void 0), this._alive;
	}
};
try {
	registerProcessor("sync-audio-worklet-processor", e);
} catch {
	console.info("Failed to register sync-audio-worklet-processor. This probably means it was already registered.");
}
//#endregion
