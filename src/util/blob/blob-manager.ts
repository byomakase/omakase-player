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

import type {Destroyable} from '../../common/capabilities';
import {BlobUtil} from './blob-util';

export class BlobManager implements Destroyable {
  private _blobs: Set<string>;
  private _ownerBlobMap: Map<string, string>;

  constructor() {
    this._blobs = new Set<string>();
    this._ownerBlobMap = new Map<string, string>();
  }

  registerBlobUrl(url: string, ownerId?: string): void {
    if (ownerId) {
      let currentUrl = this._ownerBlobMap.get(ownerId);
      if (currentUrl) {
        console.debug(`Revoking owner ${ownerId} old blob url: ${currentUrl}`);
        BlobUtil.revokeObjectURL(currentUrl);
      }
      this._ownerBlobMap.set(ownerId, url);
    } else {
      this._blobs.add(url);
    }
  }

  deleteOwnerBlobUrl(ownerId: string): void {
    let url = this._ownerBlobMap.get(ownerId);
    if (url) {
      BlobUtil.revokeObjectURL(url);
      this._ownerBlobMap.delete(ownerId);
    }
  }

  deleteBlobUrl(url: string): void {
    if (this._blobs.delete(url)) {
      BlobUtil.revokeObjectURL(url);
    }
  }

  clear(): void {
    console.debug(`Revoking all blobs`);

    [...this._ownerBlobMap.keys()].forEach((ownerId) => this.deleteOwnerBlobUrl(ownerId));
    [...this._blobs.values()].forEach((url) => this.deleteBlobUrl(url));
  }

  destroy(): void {
    this.clear();
  }
}
