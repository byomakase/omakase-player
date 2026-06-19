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

import type {AudioLevelSourceApi} from './audio-level-source';

export interface VuMeterApi {
  get config(): VuMeterConfig;

  /**
   * Sets the configuration for VU Meter.
   * @param config Partial configuration for the VU Meter. Only the provided properties will be updated, and the rest will remain unchanged.
   */
  setConfig(config: Partial<VuMeterConfig>): void;

  /**
   * Sets the source for the VU Meter.
   * @param source VU Meter source.
   */
  setSource(source: AudioLevelSourceApi): void;
}

export enum VuMeterTheme {
  DEFAULT = 'DEFAULT',
  LED = 'LED',
}

export enum VuMeterScale {
  DEFAULT = 'DEFAULT',
  NORDIC = 'NORDIC',
  NONE = 'NONE',
}

export enum VuMeterOrientation {
  VERTICAL = 'VERTICAL',
  HORIZONTAL = 'HORIZONTAL',
}

export interface VuMeterColor {
  /**
   * Maximum dB value for this color. The colors will be applied in order, so the first color with a maxValueDb higher than the current dB value will be used to color the level.
   */
  maxValueDb: number;

  /**
   * Color for the level when the dB value is below the maxValueDb. Can be any valid CSS color value.
   */
  color: string;

  /**
   * Color for the hold level when the dB value is below the maxValueDb. Can be any valid CSS color value.
   */
  holdColor: string;
}

export interface VuMeterStyle {
  /**
   * Whether to show labels for the scale values. Only applicable if the scale is not set to NONE.
   */
  showScaleLabels: boolean;

  /**
   * Whether to show ticks for the scale values. Only applicable if the scale is not set to NONE.
   */
  showScaleMarks: boolean;

  /**
   * Whether to show labels for the channels. The labels are taken from the config.labels array and are applied in order to the channels.
   */
  showChannelLabels: boolean;

  /**
   * Color configuration for the levels. The colors will be applied in order, so the first color with a maxValueDb higher than the current dB value will be used to color the level.
   */
  levelColors: VuMeterColor[];

  /**
   * Background color for the level. Can be any valid CSS color value.
   */
  levelBackground: string;
}

export interface VuMeterConfig {
  /**
   * ID of the HTML element where the VU Meter will be rendered. The element must exist in the DOM before creating the VU Meter instance.
   */
  htmlElementId: string;

  /**
   * Html element where the VU Meter will be rendered. Can be used instead of htmlElementId to provide the element directly. If both htmlElementId and htmlElement are provided, htmlElement will take precedence.
   */
  htmlElement?: HTMLElement;

  /**
   * Theme for the VU Meter. The theme controls the way the levels are rendered and colored. The DEFAULT theme renders the levels as simple bars, while the LED theme renders the levels as a series of LEDs that light up based on the dB value.
   */
  theme: VuMeterTheme;

  /**
   * Orientation of the VU Meter. Can be either vertical or horizontal.
   */
  orientation: VuMeterOrientation;

  /**
   * Number of channels to display on the VU Meter. If not specified, the VU Meter will display as many channels as provided by the audio level source. If specified, the VU Meter will display the specified number of channels, and if the audio source provides fewer channels, the remaining channels will be displayed as empty.
   */
  channels?: number | undefined;

  /**
   * Scale type for the VU Meter. The scale controls the dB values displayed on the VU Meter. The DEFAULT scale displays values from rangeMinDb to 0 with steps of scaleStepDb. The NORDIC scale displays values from rangeMinDb to 0 with steps of 3 dB and an offset of 12 dB. The NONE scale does not display any dB values.
   */
  scale: VuMeterScale;

  /**
   * Minimum dB value for the VU Meter scale. The scale will display values from this minimum value to 0 dB. This value is typically a negative number, and common values are -60 dB, -54 dB or -48 dB. The default value is -54 dB.
   */
  rangeMinDb: number;

  /**
   * Step in dB between each value displayed on the scale. The default value is 6 dB. This value is ignored if the scale is set to NORDIC, which uses a fixed step of 3 dB.
   */
  scaleStepDb: number;

  /**
   * Offset in dB for the scale values. The default value is 0 dB. This value is ignored if the scale is set to NORDIC, which uses a fixed offset of 12 dB.
   */
  scaleOffsetDb: number;

  /**
   * Duration in milliseconds for which the hold level is displayed after a peak. The hold level is the maximum level reached since the last time the level was at or below the current level. A value of 0 means that the hold level is not displayed. The default value is 0 ms.
   */
  levelHoldDuration: number;

  /**
   * Labels for the levels. The labels are applied in order to the levels, so the first label corresponds to the first level, the second label to the second level, and so on. If there are more levels than labels, the remaining levels will not have labels. The default value is ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'].
   */
  labels: string[];

  /**
   * Style configuration for the VU Meter. The style controls the visual appearance of the VU Meter, such as the colors.
   */
  style: Partial<VuMeterStyle>;
}

export const DEFAULT_VU_METER_STYLE: VuMeterStyle = {
  showScaleLabels: true,
  showScaleMarks: true,
  showChannelLabels: true,
  levelColors: [
    {
      maxValueDb: -20,
      color: '#04E400',
      holdColor: '#04E40088',
    },
    {
      maxValueDb: -10,
      color: '#F27100',
      holdColor: '#F2710088',
    },
    {
      maxValueDb: 0,
      color: '#BB0000',
      holdColor: '#BB000088',
    },
  ],
  levelBackground: 'transparent',
};

export const DEFAULT_VU_METER_CONFIG: VuMeterConfig = {
  htmlElementId: 'omakase-vu-meter',
  theme: VuMeterTheme.DEFAULT,
  scale: VuMeterScale.DEFAULT,
  orientation: VuMeterOrientation.VERTICAL,
  rangeMinDb: -54,
  scaleStepDb: 6,
  scaleOffsetDb: 0,
  levelHoldDuration: 0,
  labels: ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'],
  style: DEFAULT_VU_METER_STYLE,
};
