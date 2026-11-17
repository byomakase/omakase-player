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

import {ResourceEntityType} from '../entity';
import type {DefaultSvgResourceCreateOptions} from './svg-resource';

/** Maps each {@link ResourceEntityType} to its concrete create-options type. */
export interface ResourceCreateOptionsMap {
  /** Create options for svg resources. */
  [ResourceEntityType.SVG_RESOURCE]: DefaultSvgResourceCreateOptions;
}

/**
 * Discriminated union of all resource create-options types.
 * The optional `resourceType` field narrows the union to the options for a specific resource type.
 */
export type ResourceCreateOptions = {
  [T in keyof ResourceCreateOptionsMap]: {
    resourceType?: T;
  } & ResourceCreateOptionsMap[T];
}[keyof ResourceCreateOptionsMap];
