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
import {nodePolyfills} from 'vite-plugin-node-polyfills';

// Serves playground/tams at the server root so the app lives at http://localhost:5173/.
// This makes the OIDC redirect_uri exactly `http://localhost:5173` (the origin),
// matching the Cognito app client's registered callback URL.
export default defineConfig({
  root: resolve(__dirname, 'playground/tams'),
  // Load the root .env (VITE_APP_OIDC_* / VITE_APP_TAMS_*) even though root moved.
  envDir: __dirname,
  plugins: [
    // the playback page imports the full OmakasePlayer from ../../src, which pulls in
    // imsc/subtitle-converter (node built-ins)
    nodePolyfills({
      include: ['stream', 'util', 'timers'],
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    open: '/',
    // allow importing ../../src (and node_modules) from outside the playground/tams root
    fs: {
      allow: [resolve(__dirname)],
    },
  },
  optimizeDeps: {
    exclude: ['media-chrome'],
  },
});
