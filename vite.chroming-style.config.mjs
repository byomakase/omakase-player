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

import {resolve} from 'path';
import {defineConfig} from 'vite';
import {exec} from 'node:child_process';

export function styleUpdatePlugin() {
  return {
    name: 'style-update',
    handleHotUpdate({file}) {
      if (file.includes('/style/player-chroming/') && file.endsWith('.scss')) {
        exec('npm run build:style', (err, stdout, stderr) => {
          if (err) {
            console.error(stderr);
          } else {
            console.log(stdout);
          }
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [],
  build: {
    sourcemap: false,
    emptyOutDir: false,
    outDir: resolve(__dirname, 'style/player-chroming'),
    assetsInlineLimit: Infinity,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'style/player-chroming/player-chroming.scss'),
      },
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'player-chroming.css';
          } else {
            return assetInfo.name;
          }
        },
      },
    },
  },
});
