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
import {KonvaFlexItem} from '../../layout/konva-flex';
import {Timeline} from '../timeline';
import {TextLabel} from '../timeline-component';
import {KonvaComponentFlexContentNode} from '../../layout/konva-component-flex';
import {FlexSpacingBuilder} from '../../layout/flex-node';
import {VideoControllerApi} from '../../video/video-controller-api';

export interface LabelLaneConfig extends TimelineLaneConfig<LabelLaneStyle> {
  text: string;
}

export interface LabelLaneStyle extends TimelineLaneStyle {
  textFill: string;
  textFontSize: number;
  textFontStyle?: string;
}

const configDefault: Omit<LabelLaneConfig, 'text'> = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
  style: {
    ...TIMELINE_LANE_CONFIG_DEFAULT.style,
    height: 40,
    textFill: 'red',
    textFontSize: 14
  }
}

export class LabelLane extends BaseTimelineLane<LabelLaneConfig, LabelLaneStyle> {
  private _textLabel?: TextLabel;

  constructor(config: TimelineLaneConfigDefaultsExcluded<LabelLaneConfig>) {
    super(timelineLaneComposeConfig(configDefault, config));
  }

  override prepareForTimeline(timeline: Timeline, videoController: VideoControllerApi) {
    super.prepareForTimeline(timeline, videoController);

    this._textLabel = new TextLabel({
      text: this._config.text,
      style: {
        fontFamily: this._timeline!.style.textFontFamily,
        fontSize: this._styleAdapter.style.textFontSize,
        fontStyle: this._styleAdapter.style.textFontStyle,
        fill: this._styleAdapter.style.textFill,
        align: 'left',
        verticalAlign: 'middle'
      }
    })

    let textLabelFlexItem = new KonvaFlexItem({
      width: '100%',
      height: '100%',
      margins: FlexSpacingBuilder.instance()
        .spacing(30, 'EDGE_START')
        .build()
    }, new KonvaComponentFlexContentNode(this._textLabel))

    this.mainRightFlexGroup
      .addChild(textLabelFlexItem)
  }

  override onStyleChange() {
    super.onStyleChange();

    if (this._textLabel) {
      this._textLabel.style = {
        fontFamily: this._timeline?.style.textFontFamily,
        fontSize: this._styleAdapter.style.textFontSize,
        fontStyle: this._styleAdapter.style.textFontStyle,
        fill: this._styleAdapter.style.textFill,
      }
    }
  }

  protected settleLayout() {

  }

  override clearContent() {

  }
}
