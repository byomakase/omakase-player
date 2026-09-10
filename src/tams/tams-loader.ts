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

import Hls, {type HlsConfig, type Loader, type LoaderCallbacks, type LoaderConfiguration, type LoaderContext} from 'hls.js';
import {TamsManifestRegistry} from './hls-bridge/tams-manifest-registry';

const BaseLoader = Hls.DefaultConfig.loader as new (config: HlsConfig) => Loader<LoaderContext>;

/**
 * hls.js playlist loader (`pLoader`) that serves TAMS-derived manifests from
 * {@link TamsManifestRegistry}. Anything not in the registry (i.e. real segment
 * requests, which use `fLoader`) falls through to the default loader.
 */
export class TamsManifestLoader extends BaseLoader {
  private tamsTimer: number | undefined;

  override load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>): void {
    const content = TamsManifestRegistry.get(context.url);

    if (content === undefined) {
      if (TamsManifestRegistry.isSyntheticUrl(context.url)) {
        console.warn(`[tams] unregistered synthetic playlist requested: ${context.url}`);
      }
      // real segment / unknown request -> default loader (external server)
      super.load(context, config, callbacks);
      return;
    }

    const stats = this.stats;
    stats.loading.start = performance.now();

    // hls.js finishes wiring the loader synchronously around load(); deliver the
    // response on a macrotask so its internal state is ready before onSuccess fires
    // (default loaders are always async).
    this.tamsTimer = setTimeout(() => {
      const now = performance.now();
      stats.loading.first = now;
      stats.loading.end = now;
      stats.loaded = content.length;
      stats.total = content.length;

      callbacks.onSuccess({url: context.url, data: content}, stats, context, null);
    }, 0);
  }

  override abort(): void {
    if (this.tamsTimer !== undefined) {
      clearTimeout(this.tamsTimer);
      this.tamsTimer = undefined;
    }
    super.abort();
  }

  override destroy(): void {
    if (this.tamsTimer !== undefined) {
      clearTimeout(this.tamsTimer);
      this.tamsTimer = undefined;
    }
    super.destroy();
  }
}
