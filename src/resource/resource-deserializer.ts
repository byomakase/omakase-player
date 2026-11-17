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

import type {Destroyable} from '../common/capabilities';
import {type BaseResourceEntityArgs, type ResourceEntity, type ResourceEntityState, ResourceEntityType} from '../entity';
import {type BaseSvgResourceArgs, DefaultSvgResource, type SvgResource, type SvgResourceState} from './svg-resource';
import {SourceType, UrlSource, type UrlSourceState} from '../source';
import {isString} from '../util/util-functions';
import {UrlUtil} from '../util/url-util';

export class ResourceDeserializer implements Destroyable {
  constructor() {}

  static createResource(state: ResourceEntityState): ResourceEntity {
    switch (state.resourceType) {
      case ResourceEntityType.SVG_RESOURCE:
        return this.createSvgResource(state as SvgResourceState);
    }
  }

  protected static createSvgResource(state: SvgResourceState): SvgResource {
    return new DefaultSvgResource({
      ...this.createBaseSvgResourceArgs(state),
    });
  }

  protected static createBaseSvgResourceArgs(state: SvgResourceState): BaseSvgResourceArgs {
    return {
      ...this.createBaseResourceEntityArgs(state),
      source: state.source ? this.resolveSource(state.source) : void 0,
      blobUrl: state.blobUrl,
    };
  }

  protected static createBaseResourceEntityArgs(state: ResourceEntityState): BaseResourceEntityArgs {
    return {
      id: state.id,
    };
  }

  static resolveSource(state: UrlSourceState | string): UrlSource | string {
    if (isString(state)) {
      if (UrlUtil.isUrlAbsolute(state) || UrlUtil.isDataBase64Url(state) || UrlUtil.isBlobUrl(state)) {
        return new UrlSource(state);
      } else {
        return state;
      }
    }

    switch (state.type) {
      case SourceType.URL:
        return UrlSource.fromState(state as UrlSourceState);
      default:
        throw new Error('Unsupported resource source type');
    }
  }

  destroy() {}
}
