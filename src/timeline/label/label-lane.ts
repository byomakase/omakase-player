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

import {BaseTimelineLane, TIMELINE_LANE_CONFIG_DEFAULT, timelineLaneComposeConfig, TimelineLaneConfig, TimelineLaneConfigDefaultsExcluded, TimelineLaneStyle} from '../timeline-lane';
import {KonvaFlexGroup, KonvaFlexItem} from '../../layout/konva-flex';
import {Timeline} from '../timeline';
import {TextLabel} from '../timeline-component';
import {KonvaComponentFlexContentNode} from '../../layout/konva-component-flex';
import {FlexSpacingBuilder} from '../../layout/flex-node';
import {VideoControllerApi} from '../../video';
import {KonvaFactory} from '../../factory/konva-factory';

export interface LabelLaneConfig extends TimelineLaneConfig<LabelLaneStyle> {
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
  style: {
    ...TIMELINE_LANE_CONFIG_DEFAULT.style,
    height: 40,
    textFill: 'red',
    textFontSize: 14,
    textAreaStretch: true,
  },
};

export class LabelLane extends BaseTimelineLane<LabelLaneConfig, LabelLaneStyle> {
  protected _contentFlexGroup?: KonvaFlexGroup;
  protected _textLabel?: TextLabel;

  constructor(config: TimelineLaneConfigDefaultsExcluded<LabelLaneConfig>) {
    super(timelineLaneComposeConfig(configDefault, config));
  }

  override prepareForTimeline(timeline: Timeline, videoController: VideoControllerApi) {
    super.prepareForTimeline(timeline, videoController);

    let timecodedContainerDimension = this._timeline!.getTimecodedContainerDimension();

    this._contentFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      width: timecodedContainerDimension.width,
      height: this._config.minimized ? 0 : this._config.style.height,
      flexDirection: 'FLEX_DIRECTION_ROW',
      alignItems: 'ALIGN_CENTER',
      margins: FlexSpacingBuilder.instance().topRightBottomLeft([0, 0, 0, 10]).build(),
    });

    this._timeline!.addToTimecodedStaticContent(this._contentFlexGroup.contentNode.konvaNode);

    this._textLabel = new TextLabel({
      text: this._config.text,
      listening: true,
      style: {
        fontFamily: this._timeline!.style.textFontFamily,
        fontSize: this.style.textFontSize,
        fontStyle: this.style.textFontStyle,
        fill: this.style.textFill,
        align: 'left',
        verticalAlign: 'middle',
        textAreaStretch: this.style.textAreaStretch,
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
  }

  override onStyleChange() {
    super.onStyleChange();

    if (this._textLabel) {
      this._textLabel.style = {
        fontFamily: this._timeline?.style.textFontFamily,
        fontSize: this._styleAdapter.style.textFontSize,
        fontStyle: this._styleAdapter.style.textFontStyle,
        fill: this._styleAdapter.style.textFill,
      };
    }
  }

  protected settleLayout() {
    let timecodedContainerDimension = this._timeline!.getTimecodedContainerDimension();
    let timecodedRect = this.getTimecodedRect();

    this._contentFlexGroup!.setDimensionAndPositions(timecodedContainerDimension.width, timecodedRect.height, FlexSpacingBuilder.instance().topRightBottomLeft([timecodedRect.y, 0, 0, 0]).build());
  }

  override clearContent() {}

  override destroy() {
    super.destroy();

    this._contentFlexGroup?.destroy();
  }
}
