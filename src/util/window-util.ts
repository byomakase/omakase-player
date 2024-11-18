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

export class WindowUtil {

  static resetCursorStyle() {
    this.cursor('default');
  }

  static cursor(cursor: 'default' | 'pointer' | 'grab' | 'grabbing' | 'ew-resize' | 'col-resize') {
    document.body.style.cursor = cursor;
  }

  static open(url: string, target?: '_self' | '_blank' | '_parent' | '_top' | '_unfencedTop', features?: string): WindowProxy | undefined {
    let openedWindow = window.open(url, target, features);
    return openedWindow ? openedWindow : void 0;
  }

  static close() {
    return window.close();
  }

}
