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

export default defineConfig({
  plugins: [dtsPlugin()],
  build: {
    minify: true,
    sourcemap: true,
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'cjs', 'umd'],
      name: 'OmakasePlayer',
      // the proper extensions will be added
      fileName: (format, entryName) => `omakase-player.${format}.js`,
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled into your library
      external: ['hls.js'],
      output: {
        // Provide global variables to use in the UMD build for externalized deps
        globals: {
          OmakasePlayer: 'omakase',
          'hls.js': 'Hls',
        },
      },
    },
  },
  server: {
    open: 'playground/index.html',
  },
  optimizeDeps: {
    exclude: ['media-chrome'],
  },
});
