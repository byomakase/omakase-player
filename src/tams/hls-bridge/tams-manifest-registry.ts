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

// Holds constructed HLS manifests (master + media playlists) keyed by a synthetic
// URL. `TamsManifestLoader` (the hls.js pLoader) serves these strings instead of
// hitting the network; segment URLs are real/external and never enter the registry.
import {TAMS_MANIFEST} from '../constants';

export class TamsManifestRegistry {
  private static readonly manifests = new Map<string, string>();

  static createUrl(): string {
    return `${TAMS_MANIFEST.syntheticHost}/${crypto.randomUUID()}.m3u8`;
  }

  static isSyntheticUrl(url: string): boolean {
    return url.startsWith(TAMS_MANIFEST.syntheticHost);
  }

  static entries(): [string, string][] {
    return [...this.manifests.entries()];
  }

  static register(url: string, content: string): void {
    this.manifests.set(url, content);
  }

  /**
   * Registers playlists resolved elsewhere - another window, or an earlier load - verbatim.
   *
   * Synthetic URLs are portable: they are resolved by the `pLoader` rather than by the network, so
   * the same keys work in any window that has one.
   */
  static restore(manifests: Record<string, string>): void {
    Object.entries(manifests).forEach(([url, content]) => this.register(url, content));
  }

  static has(url: string): boolean {
    return this.manifests.has(url);
  }

  static get(url: string): string | undefined {
    return this.manifests.get(url);
  }

  static clear(url: string): void {
    this.manifests.delete(url);
  }
}
