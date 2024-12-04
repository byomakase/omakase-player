/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

export class BlobUtil {
  private static _blobs: Set<string> = new Set();

  static createBlob(blobParts: BlobPart[], options?: BlobPropertyBag): Blob {
    return new Blob(blobParts, options);
  }

  static createObjectURL(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this._blobs.add(url);
    return url;
  }

  static revokeObjectURL(url: string): void {
    this._blobs.delete(url);
    return URL.revokeObjectURL(url);
  }

  static revokeAll(): void {
    this._blobs.forEach((url) => this.revokeObjectURL(url));
  }
}
