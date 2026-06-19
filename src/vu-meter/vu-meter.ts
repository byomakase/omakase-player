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

import {AudioLevelEventType, type AudioLevelSourceApi} from './audio-level-source';
import {OmakaseVuMeterAttributes, VuMeterComponent} from './components/vu-meter-component';
import type {Destroyable} from '../common/capabilities';
import {DomUtil} from '../dom/dom-util';
import './components';
import {PlayerAudioType} from '../player';
import type {OmakasePlayerApi} from '../omakase-player-api';
import {AudioFile, TrackType, type Track} from '../media';
import {filter, takeUntil} from 'rxjs';
import {ObserverBreaker} from '../common/observer-breaker';
import {DEFAULT_VU_METER_CONFIG, DEFAULT_VU_METER_STYLE, VuMeterOrientation, VuMeterScale, VuMeterTheme, type VuMeterApi, type VuMeterConfig} from './vu-meter-api';
import {VuMeterFactory} from './vu-meter-factory';

export interface VuMeterArgs {
  /**
   * Omakase player instance, required if source is not provided
   */
  player?: OmakasePlayerApi;

  /**
   * Audio level source
   */
  source?: AudioLevelSourceApi;

  /**
   * Audio type, required to create a PeakProcessorAudioLevelSource from PlayerAudioType.MAIN or PlayerAudioType.OUTPUT
   */
  audioType?: PlayerAudioType;

  /**
   * Track, track id, or array of tracks/track ids. A single value creates a PeakProcessorAudioLevelSource (sidecar audio) or ObservationTrackAudioLevelSource (observation track); an array creates an ObservationTrackAudioLevelSource with one ObservationTrack per channel.
   */
  tracks?: Track['id'] | Track | Track['id'][] | Track[];

  /**
   * VU Meter configuration, optional
   */
  config?: Partial<VuMeterConfig>;
}

export class VuMeter implements Destroyable, VuMeterApi {
  private _config: VuMeterConfig;
  private _container: HTMLElement;
  private _vuMeterComponent!: VuMeterComponent;
  private _source?: AudioLevelSourceApi | undefined;
  private _isExternalSource = false;

  private _destroyBreaker = new ObserverBreaker();
  private _sourceBreaker = new ObserverBreaker();

  constructor(args: VuMeterArgs) {
    this._config = {
      ...DEFAULT_VU_METER_CONFIG,
      ...args.config,
      style: {
        ...DEFAULT_VU_METER_STYLE,
        ...args.config?.style,
      },
    };
    if (this._config.theme === VuMeterTheme.LED) {
      this._config.rangeMinDb = Math.round(this._config.rangeMinDb / this._config.scaleStepDb) * this._config.scaleStepDb;
      if (!args.config?.style?.levelBackground) {
        this._config.style.levelBackground = '#33333366';
      }
    }
    if (this._config.scale === VuMeterScale.NORDIC) {
      this._config.scaleOffsetDb = 12;
      this._config.scaleStepDb = 3;
    }
    if (this._config.channels && ![1, 2, 6].includes(this._config.channels)) {
      throw new Error('Invalid number of channels provided. Allowed values are 1, 2 and 6');
    }

    this._container = this.config.htmlElement ?? DomUtil.getElementByIdOrFail<HTMLElement>(this._config.htmlElementId);

    this.createDom();
    if (args.source) {
      this._source = args.source;
      this._isExternalSource = true;
      this.wireSource(this._source);
    } else if (args.player || args.audioType || args.tracks) {
      this._source = VuMeterFactory.createAudioLevelSource(args);
      this.resolveChannelCount(args);
      this.wireSource(this._source);
    }
  }

  get config(): VuMeterConfig {
    return this._config;
  }

  setConfig(config: Partial<VuMeterConfig>) {
    this._config = {
      ...this._config,
      ...config,
      style: {
        ...this._config.style,
        ...config.style,
      },
    };
    this.createDom();
    if (this._source) {
      this._sourceBreaker.break();
      this.wireSource(this._source);
    }
  }

  setSource(source: AudioLevelSourceApi) {
    this._sourceBreaker.break();
    if (this._source && !this._isExternalSource) {
      this._source.destroy();
    }
    this._isExternalSource = true;
    this.wireSource(source);
    this._source = source;
  }

  private createDom() {
    this._vuMeterComponent?.remove();
    this._vuMeterComponent = document.createElement('omakase-vu-meter') as VuMeterComponent;
    if (this._config.orientation === VuMeterOrientation.VERTICAL) {
      this._vuMeterComponent.setAttribute(OmakaseVuMeterAttributes.VERTICAL, '');
    }
    if (!this._config.style.showScaleLabels) {
      this._vuMeterComponent.setAttribute(OmakaseVuMeterAttributes.NO_SCALE_LABELS, '');
    }
    if (!this._config.style.showScaleMarks) {
      this._vuMeterComponent.setAttribute(OmakaseVuMeterAttributes.NO_SCALE_MARKS, '');
    }
    if (!this._config.style.showChannelLabels) {
      this._vuMeterComponent.setAttribute(OmakaseVuMeterAttributes.NO_CHANNEL_LABELS, '');
    }
    if (this._config.channels) {
      this._vuMeterComponent.setAttribute(OmakaseVuMeterAttributes.CHANNELS, this._config.channels.toString());
    }
    this._vuMeterComponent.colors = this._config.style.levelColors!;
    this._vuMeterComponent.levelBackground = this._config.style.levelBackground!;
    this._vuMeterComponent.setAttribute(OmakaseVuMeterAttributes.THEME, this._config.theme.toLowerCase());
    this._vuMeterComponent.setAttribute(OmakaseVuMeterAttributes.SCALE, this._config.scale.toLowerCase());
    this._vuMeterComponent.setAttribute(OmakaseVuMeterAttributes.RANGE_MIN, this._config.rangeMinDb.toString());
    this._vuMeterComponent.setAttribute(OmakaseVuMeterAttributes.SCALE_STEP, this._config.scaleStepDb.toString());
    this._vuMeterComponent.setAttribute(OmakaseVuMeterAttributes.SCALE_OFFSET, this._config.scaleOffsetDb.toString());
    this._vuMeterComponent.setAttribute(OmakaseVuMeterAttributes.LEVEL_HOLD_DURATION, this._config.levelHoldDuration.toString());
    this._vuMeterComponent.setAttribute(OmakaseVuMeterAttributes.LABELS, this._config.labels.map((label) => label.trim()).join(' '));
    this._container.appendChild(this._vuMeterComponent);
  }

  private resolveChannelCount(args: VuMeterArgs) {
    if (!this._config.channels && args.tracks) {
      const track: Track | undefined = typeof args.tracks === 'string' ? args.player?.track.get(args.tracks) : (args.tracks as Track);
      if (track?.trackType === TrackType.AUDIO && (track as AudioFile).channels) {
        this._config.channels = (track as AudioFile).channels;
      }
    }
  }

  private wireSource(source: AudioLevelSourceApi) {
    this._vuMeterComponent.setSource(source);
    if (!this._config.channels) {
      source.onEvent$
        .pipe(
          filter((event) => event.type === AudioLevelEventType.CHANNEL_COUNT_CHANGE),
          takeUntil(this._destroyBreaker.observer),
          takeUntil(this._sourceBreaker.observer)
        )
        .subscribe((event) => {
          this._vuMeterComponent.channelCount = event.data.channelCount;
        });
    }
  }

  destroy(): void {
    this._vuMeterComponent.remove();
    this._sourceBreaker.destroy();
    this._destroyBreaker.destroy();
    if (this._source && !this._isExternalSource) {
      this._source.destroy();
    }
  }
}
