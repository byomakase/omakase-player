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

class TruePeakAudioWorkletProcessor extends AudioWorkletProcessor {
  private _alive = true;
  sampleRate: number;
  numCoefficients: number;
  upsampleFactor: number;
  lpfCoefficients: number[];
  lpfBuffers: number[][];
  processCount: number;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'dispose') this._alive = false;
    };
    this.numCoefficients = 33;
    //@ts-ignore
    this.sampleRate = sampleRate;
    this.upsampleFactor = this.sampleRate > 80000 ? 2 : 4;
    this.lpfCoefficients = calculateLPFCoefficients(this.numCoefficients, this.upsampleFactor);
    // this.lpfBuffers = new Array(this.numChannels).fill(new Array(numCoefficients).fill(0));
    this.lpfBuffers = [];
    this.port.postMessage({type: 'message', message: `true peak inited? ${this.sampleRate}`});
    this.processCount = 0;
  }

  override process(inputs: Float32Array[][]) {
    const input = inputs[0]!;
    if (input.length > this.lpfBuffers.length) {
      for (let i = 1; i <= input.length; i += 1) {
        if (i > this.lpfBuffers.length) {
          this.lpfBuffers.push(new Array(this.numCoefficients).fill(0));
        }
      }
    }
    const maxes = truePeakValues(input, this.lpfBuffers, this.lpfCoefficients, this.upsampleFactor);
    this.port.postMessage({type: 'peaks', peaks: maxes});
    if (this.processCount % 100 === 0) {
      this.port.postMessage({type: 'message', message: this.lpfBuffers});
    }
    this.processCount += 1;
    return this._alive;
  }
}

function calculateLPFCoefficients(numCoefficients: number, upsampleFactor: number): number[] {
  const retCoefs = [];
  const fcRel = 1.0 / (4.0 * upsampleFactor);
  const minCoefN = 1 - Math.ceil(numCoefficients / 2);
  const maxCoefN = Math.floor(numCoefficients / 2);
  for (let n = minCoefN; n <= maxCoefN; n++) {
    const wn = 0.54 + 0.46 * Math.cos((2.0 * Math.PI * n) / numCoefficients);
    let hn = 0.0;
    if (n == 0) {
      hn = 2.0 * fcRel;
    } else {
      hn = Math.sin(2.0 * Math.PI * fcRel * n) / (Math.PI * n);
    }
    //Adapt windows & upsampler factor
    hn = wn * hn * upsampleFactor;
    retCoefs.push(hn);
  }
  return retCoefs;
}

function filterSample(lpfBuffer: number[], lpfCoefficients: number[], upsampleFactor: number): number[] {
  const upsampled = [];
  for (let nA = 0; nA < upsampleFactor; nA += 1) {
    let nT = 0;
    let retVal = 0;
    for (let nc = nA; nc < lpfCoefficients.length; nc += upsampleFactor) {
      retVal += lpfCoefficients[nc]! * lpfBuffer[lpfBuffer.length - 1 - nT]!;
      nT += 1;
    }
    upsampled.push(retVal);
  }
  return upsampled;
}

function truePeakValues(input: Float32Array[], lpfBuffers: number[][], lpfCoefficients: number[], upsampleFactor: number): number[] {
  return input.map((channel, i) => {
    const lpfBuffer = lpfBuffers[i]!;
    let max = 0;
    for (let s = 0; s < channel.length; s++) {
      const sample = channel[s];
      lpfBuffer.push(sample!);
      lpfBuffer.shift();
      const upSampled = filterSample(lpfBuffer, lpfCoefficients, upsampleFactor);
      for (let u = 0; u < upSampled.length; u++) {
        const uAbs = Math.abs(upSampled[u]!);
        if (uAbs > max) {
          max = uAbs;
        }
      }
    }
    return max;
  });
}

try {
  registerProcessor('true-peak-audio-worklet-processor', TruePeakAudioWorkletProcessor);
} catch (err) {
  console.info(`Failed to register ${'true-peak-audio-worklet-processor'}. This probably means it was already registered.`);
}
