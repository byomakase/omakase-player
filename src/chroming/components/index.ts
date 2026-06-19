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
import {OmakasePlayButton} from './omakase-play-button';
import {OmakasePreviewThumbnail} from './omakase-preview-thumbnail';
import {OmakaseRouterVisualization} from './omakase-router-visualization';
import {OmakaseTimeDisplay} from './omakase-time-display';
import {OmakaseTimeRange} from './omakase-time-range';
import {OmakaseVolumeRange} from './omakase-volume-range';

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

if (!globalThis.customElements.get('omakase-play-button')) {
  globalThis.customElements.define('omakase-play-button', OmakasePlayButton);
}

if (!globalThis.customElements.get('omakase-mute-button')) {
  globalThis.customElements.define('omakase-mute-button', OmakaseMuteButton);
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
  OmakaseMuteButton,
  OmakaseTimeRange,
  OmakaseTimeDisplay,
  OmakaseVolumeRange,
  OmakaseFullscreenButton,
  OmakaseDropdown,
  OmakaseDropdownList,
  OmakaseDropdownToggle,
  OmakaseDropdownOption,
  OmakaseMarkerBars as OmakaseMarkerBar,
  OmakaseMarkerBar as OmakaseMarkerTrack,
  OmakasePreviewThumbnail,
  OmakaseAudioVisualization,
};
