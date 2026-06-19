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

class PeakSampleAudioWorkletProcessor extends AudioWorkletProcessor {
  private _alive = true;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'dispose') this._alive = false;
    };
  }

  override process(inputs: Float32Array[][]) {
    const input = inputs[0];
    const maxes = peakValues(input!);
    this.port.postMessage({type: 'peaks', peaks: maxes});
    return this._alive;
  }
}

function calculateMaxValues(inputBuffer: AudioBuffer): Array<number> {
  const channelMaxes = [];
  const {numberOfChannels} = inputBuffer;

  for (let c = 0; c < numberOfChannels; c += 1) {
    channelMaxes[c] = 0.0;
    const channelData = inputBuffer.getChannelData(c);
    for (let s = 0; s < channelData.length; s += 1) {
      if (Math.abs(channelData[s]!) > channelMaxes[c]!) {
        channelMaxes[c] = Math.abs(channelData[s]!);
      }
    }
  }
  return channelMaxes;
}

function peakValues(input: Float32Array[]): number[] {
  return input.map((channel) => {
    let max = 0;
    for (let s = 0; s < channel.length; s++) {
      const sAbs = Math.abs(channel[s]!);
      if (sAbs > max) {
        max = sAbs;
      }
    }
    return max;
  });
}

try {
  registerProcessor('peak-sample-audio-worklet-processor', PeakSampleAudioWorkletProcessor);
} catch (err) {
  console.info(`Failed to register ${'peak-sample-audio-worklet-processor'}. This probably means it was already registered.`);
}
