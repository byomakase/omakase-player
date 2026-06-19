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

import {type PlayerApi} from '../../player';
import type {TimelineImpl} from '../timeline';
import {KonvaFactory} from '../konva/konva-factory';
import {BaseTimelineLane, TIMELINE_LANE_CONFIG_DEFAULT, type TimelineLaneConfig, type TimelineLaneStyle} from '../timeline-lane';
import {KonvaFlexGroup, KonvaFlexItem} from '../layout/konva-flex';
import {TextLabel} from '../timeline-component';
import {FlexSpacingBuilder} from '../layout/flex-node';
import {KonvaComponentFlexContentNode} from '../layout/konva-component-flex';
import type {StyledElementWithId} from '../../ui';
import {type ConfigAndStyle} from '../timeline-api';
import {omitKeys} from '../../util/object-util';
import type {OmpProvider} from '../../omp-provider';

export interface LabelLaneConfig extends TimelineLaneConfig {
  text: string;
}

export interface LabelLaneStyle extends TimelineLaneStyle {
  textFill: string;
  textFontSize: number;
  textFontStyle?: string;
  textAreaStretch?: boolean;
}

const configDefault: Omit<LabelLaneConfig, 'text'> = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
};

export class LabelLane extends BaseTimelineLane<LabelLaneConfig, LabelLaneStyle> {
  protected _contentFlexGroup?: KonvaFlexGroup;
  protected _textLabel?: TextLabel;

  constructor(configAndStyle: ConfigAndStyle<LabelLaneConfig, LabelLaneStyle> & Pick<LabelLaneConfig, 'text'>) {
    super(
      {
        ...configDefault,
        ...omitKeys(configAndStyle, 'style'),
      },
      configAndStyle.style
    );
  }

  /**
   * @internal
   * @param timeline
   * @param player
   * @param ompProvider
   */
  override prepareForTimeline(timeline: TimelineImpl, player: PlayerApi, ompProvider: OmpProvider) {
    super.prepareForTimeline(timeline, player, ompProvider);

    let timecodedContainerDimension = this._timeline!.getTimecodedContainerDimension();

    this._contentFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      width: timecodedContainerDimension.width,
      height: this._config.minimized ? 0 : this._style!.height,
      flexDirection: 'FLEX_DIRECTION_ROW',
      alignItems: 'ALIGN_CENTER',
      margins: FlexSpacingBuilder.create().topRightBottomLeft([0, 0, 0, 10]).build(),
    });

    this._timeline!.addToTimecodedStaticContent(this._contentFlexGroup.contentNode.konvaNode);

    this._textLabel = new TextLabel({
      text: this._config.text,
      listening: true,
      style: {
        fontFamily: this._timeline!.style.textFontFamily,
        fontSize: this._style!.textFontSize,
        fontStyle: this._style!.textFontStyle,
        fill: this._style!.textFill,
        align: 'left',
        verticalAlign: 'middle',
        textAreaStretch: this._style!.textAreaStretch,
      },
    });

    let textLabelFlexItem = new KonvaFlexItem(
      {
        flexGrow: 1,
        height: '100%',
      },
      new KonvaComponentFlexContentNode(this._textLabel)
    );

    // clipping when minimized
    this._contentFlexGroup.contentNode.konvaNode.clipFunc((ctx) => {
      let layout = this._contentFlexGroup!.getLayout();
      ctx.rect(0, 0, layout.width, layout.height);
    });

    this._contentFlexGroup.addChild(textLabelFlexItem);

    this._prepared.next(true);
  }

  protected createStyledElement(): StyledElementWithId<LabelLaneStyle> {
    return {
      id: this._id,
      classes: [this._ui!.resolveStyleClass('LabelLane')],
    };
  }

  protected settleLayout() {
    let timecodedContainerDimension = this._timeline!.getTimecodedContainerDimension();
    let timecodedRect = this.getTimecodedRect();

    this._contentFlexGroup!.setDimensionAndPositions(timecodedContainerDimension.width, timecodedRect.height, FlexSpacingBuilder.create().topRightBottomLeft([timecodedRect.y, 0, 0, 0]).build());
  }

  override destroy() {
    super.destroy();

    this._contentFlexGroup?.destroy();
  }

  override clearContent() {}
}
