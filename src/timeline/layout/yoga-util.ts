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

import type {Config, Node} from 'yoga-layout';

export class YogaUtil {
  public static free(...nodes: (Node | Config)[]) {
    nodes.forEach((node: Node | Config) => {
      if (node) {
        try {
          // Detach from parent before freeing. If we free a node while it is still
          // registered as a child of another node, the parent retains a dangling C++
          // pointer. Yoga's WASM allocator may reuse that address for a new node,
          // causing the new node to appear to already have a parent, which makes
          // subsequent insertChild calls throw a BindingError.
          const yogaNode = node as Node;
          if (typeof yogaNode.getParent === 'function') {
            const parent = yogaNode.getParent();
            if (parent !== null && parent !== undefined) {
              try {
                parent.removeChild(yogaNode);
              } catch {
                // ignore — parent may already be freed
              }
            }
          }
          node.free();
        } catch (e) {
          // console.error(e);
        }
      }
    });
  }
}

export function yogaLiberator(...nodes: (Node | Config)[]) {
  YogaUtil.free(...nodes);
}
