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

import {type MediaProbe, MediaProbeImpl, type MediaProbeResult, MediaProbeToolType} from './media-probe';
import {Observable} from 'rxjs';
import type {Destroyable} from '../common/capabilities';

const defaultProbeToolTypes: MediaProbeToolType[] = [MediaProbeToolType.EXTENSION_PROBE, MediaProbeToolType.HEAD_REQUEST_PROBE, MediaProbeToolType.MEDIA_METADATA_RESOLVER_PROBE];

export interface OmakaseToolsApi {
  /**
   * Probes a media URL to retrieve metadata such as MIME type, codec, and container information.
   *
   * Uses the default tool types ({@link MediaProbeToolType.EXTENSION_PROBE} and
   * {@link MediaProbeToolType.HEAD_REQUEST_PROBE}) when no `toolTypes` are specified.
   *
   * @param url - The URL of the media resource to probe.
   * @param toolTypes - Optional list of probe strategies to use. Defaults to extension and HEAD request probes.
   * @returns An Observable that emits the {@link MediaProbeResult} or `undefined` if probing was unsuccessful.
   */
  probe(url: string, toolTypes?: MediaProbeToolType[]): Observable<MediaProbeResult | undefined>;
}

export class OmakaseTools implements OmakaseToolsApi, Destroyable {
  private static _instance: OmakaseTools | undefined;

  static get instance(): OmakaseTools {
    return (this._instance ??= new OmakaseTools());
  }

  private _mediaProbe: MediaProbe = new MediaProbeImpl();

  private constructor() {}

  probe(url: string, toolTypes?: MediaProbeToolType[]): Observable<MediaProbeResult | undefined> {
    return this._mediaProbe.probe(url, toolTypes ?? defaultProbeToolTypes);
  }

  destroy() {
    if (OmakaseTools._instance === this) {
      OmakaseTools._instance = void 0;
    }
  }
}
