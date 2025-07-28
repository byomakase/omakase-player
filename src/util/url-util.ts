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

export class UrlUtil {
  static isUrlAbsolute(url: string) {
    return /^(https?|file):\/\//i.test(url);
  }

  static absolutizeUrl(rootUrl: string, url: string) {
    return this.isUrlAbsolute(url) ? url : `${rootUrl}/${url}`;
  }

  static formatBase64Url(mime: string, base64: string): string {
    return `data:${mime};base64,${base64}`;
  }

  static getFilenameFromUrl(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
      return filename;
    } catch (error) {
      return url;
    }
  }

  static isDataBase64Url(url: string): boolean {
    return url.startsWith('data:');
  }

  static getDataBase64UrlContentLength(url: string): number {
    if (!this.isDataBase64Url(url)) {
      throw new Error('Not a valid data URL');
    }

    const base64Index = url.indexOf(';base64,');
    if (base64Index === -1) {
      throw new Error('Not a base64-encoded data URL');
    }

    const base64Data = url.slice(base64Index + ';base64,'.length);

    const len = base64Data.length;
    const padding = (base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0);

    return Math.floor((len * 3) / 4) - padding;
  }
}
