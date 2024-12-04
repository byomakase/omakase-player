/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

// @ts-ignore
class OmpDetachedPlayerProcessor extends AudioWorkletProcessor {
  override process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    this.port.postMessage(''); // simple message to trigger onmessage
    return true;
  }
}

try {
  registerProcessor('omp-sync-watchdog-processor', OmpDetachedPlayerProcessor);
} catch (err) {
  console.info(`Failed to register ${'omp-sync-watchdog-processor'}. This probably means it was already registered.`);
}
