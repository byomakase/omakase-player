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

import {resolve} from 'path';
import {defineConfig} from 'vite';
import dtsPlugin from 'vite-plugin-dts';

const outputNames = {
  omp_peak_sample_processor: 'omp-peak-sample-processor.js',
  omp_true_peak_processor: 'omp-true-peak-processor.js',
  omp_synchronization_processor: 'omp-synchronization-processor.js',
};

export default defineConfig({
  plugins: [dtsPlugin()],
  build: {
    sourcemap: false,
    emptyOutDir: false,
    outDir: resolve(__dirname, 'src/worker'),
    lib: {
      // Specify multiple entry points
      entry: {
        omp_peak_sample_processor: resolve(__dirname, 'src/worker/omp-peak-sample-processor.ts'),
        omp_true_peak_processor: resolve(__dirname, 'src/worker/omp-true-peak-processor.ts'),
        omp_synchronization_processor: resolve(__dirname, 'src/worker/omp-synchronization-processor.ts'),
      },
      formats: ['es'], // Only output ES format
      name: 'OmpWorkers', // Global name if needed
      // fileName: (format, entryName) => `${entryName}.js`, // Use entry name for file name
      fileName: (format, entryName) => {
        return `${outputNames[entryName]}` || `${entryName}.js`; // Fallback to entryName if not found
      },
    },
    rollupOptions: {},
  },
});
