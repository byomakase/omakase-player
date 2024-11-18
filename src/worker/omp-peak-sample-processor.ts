import {peakValues} from './peak-sample';

class OmpPeakSampleProcessor extends AudioWorkletProcessor {
  override process(inputs: Float32Array[][]) {
    const input = inputs[0];
    const maxes = peakValues(input);
    this.port.postMessage({type: 'peaks', peaks: maxes});
    return true;
  }
}

const ompAudioWorkletProcessorName = 'omp-peak-sample-processor';
try {
  registerProcessor(ompAudioWorkletProcessorName, OmpPeakSampleProcessor);
} catch (err) {
  console.info(`Failed to register ${ompAudioWorkletProcessorName}. This probably means it was already registered.`);
}
