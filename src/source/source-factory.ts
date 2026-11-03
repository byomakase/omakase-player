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

import {InternalSource, type InternalSourceState, type Source, type SourceState, SourceType, SourceUtil, TrackSource, type TrackSourceState, UrlSource} from './source';

export class SourceFactory {
  static create(sourceState: SourceState): Source {
    switch (sourceState.type) {
      case SourceType.URL:
        return new UrlSource(SourceUtil.resolveUrlFromSourceStateOrFail(sourceState));
      case SourceType.TRACK:
        return TrackSource.fromState(sourceState as TrackSourceState);
      case SourceType.INTERNAL:
        return InternalSource.fromState(sourceState as InternalSourceState);
      default:
        throw new Error(`Cannot create source from: '${JSON.stringify(sourceState)}'`);
    }
  }
}
