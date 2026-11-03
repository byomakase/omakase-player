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

import {OmakaseAudioVisualization} from './omakase-audio-visualization';
import {OmakaseDropdown} from './omakase-dropdown';
import {OmakaseDropdownList} from './omakase-dropdown-list';
import {OmakaseDropdownOption} from './omakase-dropdown-option';
import {OmakaseDropdownToggle} from './omakase-dropdown-toggle';
import {OmakaseFullscreenButton} from './omakase-fullscreen-button';
import {OmakaseMarkerBars} from './omakase-marker-bars';
import {OmakaseMarkerBar} from './omakase-marker-bar';
import {OmakaseMuteButton} from './omakase-mute-button';
import {OmakaseCaptionsToggle} from './omakase-captions-toggle';
import {OmakasePlaybackRateSelector} from './omakase-playback-rate-selector';
import {OmakaseAudioSelector} from './omakase-audio-selector';
import {OmakaseTextSelector} from './omakase-text-selector';
import {OmakaseTrackSelector} from './omakase-track-selector';
import {OmakaseMenu} from './omakase-menu';
import {OmakasePlayButton} from './omakase-play-button';
import {OmakaseLiveButton} from './omakase-live-button';
import {OmakasePreviewThumbnail} from './omakase-preview-thumbnail';
import {OmakaseRouterVisualization} from './omakase-router-visualization';
import {OmakaseTimeDisplay} from './omakase-time-display';
import {OmakaseTimeRange} from './omakase-time-range';
import {OmakaseTimeSkipButton} from './omakase-time-skip-button';
import {OmakaseTimeToggle} from './omakase-time-toggle';
import {OmakaseVolumeRange} from './omakase-volume-range';
import {OmakaseVuMeterToggle} from './omakase-vu-meter-toggle';
import {OmakaseRewindAndPlayButton} from './omakase-rewind-and-play-button';
import {OmakasePlayAndRewindButton} from './omakase-play-and-rewind-button';
import {OmakaseHomeButton} from './omakase-home-button';
import {OmakaseEndButton} from './omakase-end-button';
import {OmakaseKeyframeButton} from './omakase-keyframe-button';
import {OmakaseSafeZoneToggle} from './omakase-safe-zone-toggle';
import {OmakaseDetachToggle} from './omakase-detach-toggle';

if (!globalThis.customElements.get('omakase-dropdown')) {
  globalThis.customElements.define('omakase-dropdown', OmakaseDropdown);
}

if (!globalThis.customElements.get('omakase-dropdown-list')) {
  globalThis.customElements.define('omakase-dropdown-list', OmakaseDropdownList);
}

if (!globalThis.customElements.get('omakase-dropdown-toggle')) {
  globalThis.customElements.define('omakase-dropdown-toggle', OmakaseDropdownToggle);
}

if (!globalThis.customElements.get('omakase-dropdown-option')) {
  globalThis.customElements.define('omakase-dropdown-option', OmakaseDropdownOption);
}

if (!globalThis.customElements.get('omakase-playback-rate-selector')) {
  globalThis.customElements.define('omakase-playback-rate-selector', OmakasePlaybackRateSelector);
}

if (!globalThis.customElements.get('omakase-audio-selector')) {
  globalThis.customElements.define('omakase-audio-selector', OmakaseAudioSelector);
}

if (!globalThis.customElements.get('omakase-text-selector')) {
  globalThis.customElements.define('omakase-text-selector', OmakaseTextSelector);
}

if (!globalThis.customElements.get('omakase-track-selector')) {
  globalThis.customElements.define('omakase-track-selector', OmakaseTrackSelector);
}

if (!globalThis.customElements.get('omakase-menu')) {
  globalThis.customElements.define('omakase-menu', OmakaseMenu);
}

if (!globalThis.customElements.get('omakase-play-button')) {
  globalThis.customElements.define('omakase-play-button', OmakasePlayButton);
}

if (!globalThis.customElements.get('omakase-live-button')) {
  globalThis.customElements.define('omakase-live-button', OmakaseLiveButton);
}

if (!globalThis.customElements.get('omakase-mute-button')) {
  globalThis.customElements.define('omakase-mute-button', OmakaseMuteButton);
}

if (!globalThis.customElements.get('omakase-captions-toggle')) {
  globalThis.customElements.define('omakase-captions-toggle', OmakaseCaptionsToggle);
}

if (!globalThis.customElements.get('omakase-time-range')) {
  globalThis.customElements.define('omakase-time-range', OmakaseTimeRange);
}

if (!globalThis.customElements.get('omakase-time-display')) {
  globalThis.customElements.define('omakase-time-display', OmakaseTimeDisplay);
}

if (!globalThis.customElements.get('omakase-volume-range')) {
  globalThis.customElements.define('omakase-volume-range', OmakaseVolumeRange);
}

if (!globalThis.customElements.get('omakase-marker-bars')) {
  globalThis.customElements.define('omakase-marker-bars', OmakaseMarkerBars);
}

if (!globalThis.customElements.get('omakase-marker-bar')) {
  globalThis.customElements.define('omakase-marker-bar', OmakaseMarkerBar);
}

if (!globalThis.customElements.get('omakase-fullscreen-button')) {
  globalThis.customElements.define('omakase-fullscreen-button', OmakaseFullscreenButton);
}

if (!globalThis.customElements.get('omakase-time-skip-button')) {
  globalThis.customElements.define('omakase-time-skip-button', OmakaseTimeSkipButton);
}

if (!globalThis.customElements.get('omakase-time-toggle')) {
  globalThis.customElements.define('omakase-time-toggle', OmakaseTimeToggle);
}

if (!globalThis.customElements.get('omakase-vu-meter-toggle')) {
  globalThis.customElements.define('omakase-vu-meter-toggle', OmakaseVuMeterToggle);
}

if (!globalThis.customElements.get('omakase-rewind-and-play-button')) {
  globalThis.customElements.define('omakase-rewind-and-play-button', OmakaseRewindAndPlayButton);
}

if (!globalThis.customElements.get('omakase-play-and-rewind-button')) {
  globalThis.customElements.define('omakase-play-and-rewind-button', OmakasePlayAndRewindButton);
}

if (!globalThis.customElements.get('omakase-home-button')) {
  globalThis.customElements.define('omakase-home-button', OmakaseHomeButton);
}

if (!globalThis.customElements.get('omakase-end-button')) {
  globalThis.customElements.define('omakase-end-button', OmakaseEndButton);
}

if (!globalThis.customElements.get('omakase-keyframe-button')) {
  globalThis.customElements.define('omakase-keyframe-button', OmakaseKeyframeButton);
}

if (!globalThis.customElements.get('omakase-safe-zone-toggle')) {
  globalThis.customElements.define('omakase-safe-zone-toggle', OmakaseSafeZoneToggle);
}

if (!globalThis.customElements.get('omakase-detach-toggle')) {
  globalThis.customElements.define('omakase-detach-toggle', OmakaseDetachToggle);
}

if (!globalThis.customElements.get('omakase-preview-thumbnail')) {
  globalThis.customElements.define('omakase-preview-thumbnail', OmakasePreviewThumbnail);
}

if (!globalThis.customElements.get('omakase-audio-visualization')) {
  globalThis.customElements.define('omakase-audio-visualization', OmakaseAudioVisualization);
}

if (!globalThis.customElements.get('omakase-router-visualization')) {
  globalThis.customElements.define('omakase-router-visualization', OmakaseRouterVisualization);
}

export {
  OmakasePlayButton,
  OmakaseLiveButton,
  OmakaseMuteButton,
  OmakaseCaptionsToggle,
  OmakasePlaybackRateSelector,
  OmakaseAudioSelector,
  OmakaseTextSelector,
  OmakaseTrackSelector,
  OmakaseMenu,
  OmakaseTimeRange,
  OmakaseTimeDisplay,
  OmakaseVolumeRange,
  OmakaseFullscreenButton,
  OmakaseTimeSkipButton,
  OmakaseTimeToggle,
  OmakaseVuMeterToggle,
  OmakaseRewindAndPlayButton,
  OmakasePlayAndRewindButton,
  OmakaseHomeButton,
  OmakaseEndButton,
  OmakaseKeyframeButton,
  OmakaseSafeZoneToggle,
  OmakaseDetachToggle,
  OmakaseDropdown,
  OmakaseDropdownList,
  OmakaseDropdownToggle,
  OmakaseDropdownOption,
  OmakaseMarkerBars as OmakaseMarkerBar,
  OmakaseMarkerBar as OmakaseMarkerTrack,
  OmakasePreviewThumbnail,
  OmakaseAudioVisualization,
};

export type {OmakaseMenuOption} from './omakase-menu';
export {OmakaseLiveButtonAttributes} from './omakase-live-button';
export {OmakaseDetachToggleAttributes, type OmakaseDetachToggleHandler} from './omakase-detach-toggle';
export {OmakaseKeyframeButtonAttributes, type OmakaseKeyframeConfig} from './omakase-keyframe-button';
export {OmakaseSafeZoneToggleAttributes, type OmakaseSafeZoneToggleConfig, type OmakaseSafeZoneToggleZone} from './omakase-safe-zone-toggle';
