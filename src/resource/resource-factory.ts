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

import {MediaProbeToolType, type OmakaseToolsApi} from '../tools';
import {OmakaseTools} from '../tools/omakase-tools-api';
import {type ResourceEntity, ResourceEntityType} from '../entity';
import {FileFormat, FileFormatType} from '../common';
import {UrlSource} from '../source';
import {map, type Observable, of} from 'rxjs';
import type {ResourceCreateOptions} from './resource-create-options';
import {Validators} from '../common/validators';
import {isString} from '../util/util-functions';
import {DefaultSvgResource, type DefaultSvgResourceCreateOptions} from './svg-resource';
import {SvgUtil} from '../util/svg-util';

export class ResourceFactory {
  protected static get _tools(): OmakaseToolsApi {
    return OmakaseTools.instance;
  }

  private static readonly RESOURCE_TYPE_FORMATS: Record<ResourceEntityType, readonly FileFormatType[]> = {
    [ResourceEntityType.SVG_RESOURCE]: [FileFormatType.SVG],
  };

  static createResource(sourceOrInline: UrlSource | string, createOptions?: ResourceCreateOptions | undefined): Observable<ResourceEntity> {
    return this.resolveResourceType(sourceOrInline, createOptions).pipe(
      map(({resourceType, fileFormat}) => {
        const sourceFileFormatType = fileFormat?.type;
        switch (resourceType) {
          case ResourceEntityType.SVG_RESOURCE:
            return new DefaultSvgResource({
              source: sourceOrInline,
              sourceFileFormatType,
              ...(createOptions as DefaultSvgResourceCreateOptions | undefined)?.args,
            });
          default:
            throw new Error('niy');
        }
      })
    );
  }

  static resolveResourceType(
    sourceOrInline?: UrlSource | string,
    createOptions?: ResourceCreateOptions | undefined
  ): Observable<{resourceType: ResourceEntityType; fileFormat: FileFormat | undefined}> {
    const fileFormatType = createOptions?.fileFormatType;
    const fileFormat = fileFormatType ? FileFormat.fromType(fileFormatType) : undefined;
    if (fileFormatType && !fileFormat) {
      throw new Error(`Cannot resolve fileFormat from fileFormatType: ${fileFormatType}`);
    }

    const resourceType = createOptions?.resourceType;
    if (resourceType) {
      Validators.resourceType()(resourceType);

      // resourceType provided and has no file format concept - resolve immediately
      if (!this.RESOURCE_TYPE_FORMATS[resourceType]) {
        return of({resourceType, fileFormat: void 0});
      }

      // Validate fileFormat against resourceType
      if (fileFormat && !this.RESOURCE_TYPE_FORMATS[resourceType].includes(fileFormat.type)) {
        throw new Error(`fileFormatType ${fileFormatType} is not compatible with resourceType ${resourceType}`);
      }
    }

    // fileFormat known — derive resourceType if needed, no probe required
    if (fileFormat) {
      const resolvedResourceType = resourceType ?? this.resourceTypeFromFileFormat(fileFormat);
      if (!resolvedResourceType) {
        throw new Error(`Cannot resolve resourceType from fileFormatType: ${fileFormatType}`);
      }
      return of({resourceType: resolvedResourceType, fileFormat});
    }

    // probe to resolve fileFormat
    if (!sourceOrInline) {
      throw new Error(`Cannot resolve fileFormat: sourceOrInline is required when fileFormatType is not provided`);
    }

    if (isString(sourceOrInline)) {
      const resolvedResourceType = this.resourceTypeFromInlineData(sourceOrInline);
      if (!resolvedResourceType) {
        throw new Error(`Cannot resolve resourceType from inline data: ${sourceOrInline}`);
      }
      return of({resourceType: resolvedResourceType, fileFormat: FileFormat.fromType(this.RESOURCE_TYPE_FORMATS[resolvedResourceType][0]!)});
    }

    return this._tools.probe(sourceOrInline.url, [MediaProbeToolType.EXTENSION_PROBE, MediaProbeToolType.HEAD_REQUEST_PROBE]).pipe(
      map((mediaProbeResult) => {
        const probedFileFormat = mediaProbeResult?.fileFormat;
        if (!probedFileFormat) {
          throw new Error(`Cannot resolve fileFormat for: ${JSON.stringify(sourceOrInline?.state)}`);
        }
        const probedResourceType = this.resourceTypeFromFileFormat(probedFileFormat);
        if (resourceType) {
          const allowed = this.RESOURCE_TYPE_FORMATS[resourceType];
          if (!allowed?.includes(probedFileFormat.type)) {
            throw new Error(`resourceType ${resourceType} is not compatible with probed fileFormat ${probedFileFormat.type}`);
          }
        }
        const resolvedResourceType = resourceType ?? probedResourceType;
        if (!resolvedResourceType) {
          throw new Error(`Cannot resolve resourceType for: ${JSON.stringify(sourceOrInline?.state)}`);
        }
        return {resourceType: resolvedResourceType, fileFormat: probedFileFormat};
      })
    );
  }

  private static resourceTypeFromFileFormat(fileFormat: FileFormat | undefined): ResourceEntityType | undefined {
    if (!fileFormat) {
      return void 0;
    }
    return (Object.entries(this.RESOURCE_TYPE_FORMATS) as [ResourceEntityType, FileFormatType[]][]).find(([_, formats]) => formats.includes(fileFormat.type))?.[0];
  }

  private static resourceTypeFromInlineData(inlineData: string): ResourceEntityType | undefined {
    if (SvgUtil.isSvg(inlineData)) {
      return ResourceEntityType.SVG_RESOURCE;
    }
    return void 0;
  }
}
