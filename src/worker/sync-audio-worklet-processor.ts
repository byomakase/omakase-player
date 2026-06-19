/*
 * Copyright 2026 ByOmakase, LLC (https://byomakase.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

class SyncAudioWorkletProcessor extends AudioWorkletProcessor {
  private _alive = true;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'dispose') this._alive = false;
    };
  }

  override process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    this.port.postMessage(void 0); // simple message to trigger onmessage
    return this._alive;
  }
}

try {
  registerProcessor('sync-audio-worklet-processor', SyncAudioWorkletProcessor);
} catch (err) {
  console.info(`Failed to register ${'sync-audio-worklet-processor'}. This probably means it was already registered.`);
}
