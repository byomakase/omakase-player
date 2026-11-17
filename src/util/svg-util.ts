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

export class SvgUtil {
  static svgRegex = /<svg|<\/svg>/;
  static svgBase64Regex = /^data:image\/svg\+xml/;

  static readonly SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

  static isSvg(data: string): boolean {
    return this.svgRegex.test(data) || this.svgBase64Regex.test(data);
  }

  static validateSvg(data: string): void {
    const doc = new DOMParser().parseFromString(data, 'image/svg+xml');

    if (doc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('Invalid SVG: markup is not well-formed XML');
    }

    const root = doc.documentElement;
    if (root.localName !== 'svg' || root.namespaceURI !== SvgUtil.SVG_NAMESPACE) {
      throw new Error(`Invalid SVG: root element must be <svg xmlns=${this.SVG_NAMESPACE}`);
    }
  }
}
