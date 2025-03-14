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

import Konva from 'konva';

export class KonvaUtil {
  public static unlisten(...nodes: (Konva.Node | undefined)[]) {
    nodes.forEach((node) => {
      if (node) {
        try {
          for (let eventListenersKey in node.eventListeners) {
            node.removeEventListener(eventListenersKey);
          }
        } catch (e) {
          console.error(e);
        }
      }
    });
  }
}

export function konvaUnlistener(...nodes: (Konva.Node | undefined)[]) {
  KonvaUtil.unlisten(...nodes);
}
