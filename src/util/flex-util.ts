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
import {ColorUtil} from './color-util';
import {KonvaFlexGroup, KonvaFlexItem} from '../layout/konva-flex';
import {FlexNode} from '../layout/flex-node';
import {BaseFlexGroup} from '../layout/flex-group';
import {KonvaFactory} from '../factory/konva-factory';

export class FlexUtil {
  static debugKonvaFlexGroup(text: string, fill?: string, width: number = 100, height: number = 100, opacity: number = 0.5): KonvaFlexGroup {
    let group = new Konva.Group({
      width: width,
      height: height,
    });

    group.add(
      KonvaFactory.createRect({
        width: width,
        height: height,
        fill: fill ? fill : ColorUtil.randomHexColor(),
        opacity: opacity,
      })
    );

    let konvaText = new Konva.Text({
      text: text,
    });

    group.add(konvaText);

    let flexGroup = KonvaFlexGroup.of({
      konvaNode: group,
      name: text,
      width: width,
      height: height,
    });
    return flexGroup;
  }

  static echoFlexNodeLayout(flexNode: FlexNode<any>, level: number = 1) {
    if (flexNode) {
      console.log(`${Array(level).join('\t')} ${flexNode.name}`, flexNode.getLayout());
      if (flexNode instanceof BaseFlexGroup) {
        flexNode.getChildren().forEach((child) => {
          FlexUtil.echoFlexNodeLayout(child, level + 1);
        });
      }
    } else {
      console.debug('Nothing to echo');
    }
  }

  static debugKonvaFlexGroupBg(fill: string, opacity: number = 1) {
    let debugBgGroup = KonvaFlexGroup.of({
      konvaNode: new Konva.Group(),
      name: `bg-group`,
      height: '100%',
      width: '100%',
      positionType: 'POSITION_TYPE_ABSOLUTE',
      justifyContent: 'JUSTIFY_SPACE_BETWEEN',
    });

    let debugBgGroupFlexItem = KonvaFlexItem.of(
      {
        name: `bg-group-flex-item`,
        width: '100%',
        height: '100%',
        positionType: 'POSITION_TYPE_ABSOLUTE',
      },
      KonvaFactory.createRect({
        fill: fill,
        opacity: opacity,
        listening: false,
      })
    );

    return debugBgGroup.addChild(debugBgGroupFlexItem);
  }
}
