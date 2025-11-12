import {OmakaseFullscreenButton} from './omakase-fullscreen-button';
import {OmakasePlayButton} from './omakase-play-button';
import {OmakaseTimeRange} from './omakase-time-range';
import {OmakaseTimeDisplay} from './omakase-time-display';
import {OmakasePreviewThumbnail} from './omakase-preview-thumbnail';
import {OmakaseTimecodeEdit} from './omakase-timecode-edit';
import {OmakaseDropdown} from './omakase-dropdown';
import {OmakaseDropdownToggle} from './omakase-dropdown-toggle';
import {OmakaseDropdownOption} from './omakase-dropdown-option';
import {OmakaseVolumeRange} from './omakase-volume-range';
import {OmakaseMuteButton} from './omakase-mute-button';
import {OmakaseDropdownList} from './omakase-dropdown-list';
import {OmakaseMarkerTrack} from './omakase-marker-track';
import {OmakaseMarkerBar} from './omakase-marker-bar';
import {OmakaseAudioVisualization} from './omakase-audio-visualization';

if (!globalThis.customElements.get('omakase-time-range')) {
  globalThis.customElements.define('omakase-time-range', OmakaseTimeRange);
}

if (!globalThis.customElements.get('omakase-volume-range')) {
  globalThis.customElements.define('omakase-volume-range', OmakaseVolumeRange);
}

if (!globalThis.customElements.get('omakase-mute-button')) {
  globalThis.customElements.define('omakase-mute-button', OmakaseMuteButton);
}

if (!globalThis.customElements.get('omakase-play-button')) {
  globalThis.customElements.define('omakase-play-button', OmakasePlayButton);
}

if (!globalThis.customElements.get('omakase-fullscreen-button')) {
  globalThis.customElements.define('omakase-fullscreen-button', OmakaseFullscreenButton);
}

if (!globalThis.customElements.get('omakase-time-display')) {
  globalThis.customElements.define('omakase-time-display', OmakaseTimeDisplay);
}

if (!globalThis.customElements.get('omakase-preview-thumbnail')) {
  globalThis.customElements.define('omakase-preview-thumbnail', OmakasePreviewThumbnail);
}

if (!globalThis.customElements.get('omakase-timecode-edit')) {
  globalThis.customElements.define('omakase-timecode-edit', OmakaseTimecodeEdit);
}

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

if (!globalThis.customElements.get('omakase-marker-track')) {
  globalThis.customElements.define('omakase-marker-track', OmakaseMarkerTrack);
}

if (!globalThis.customElements.get('omakase-marker-bar')) {
  globalThis.customElements.define('omakase-marker-bar', OmakaseMarkerBar);
}

if (!globalThis.customElements.get('omakase-audio-visualization')) {
  globalThis.customElements.define('omakase-audio-visualization', OmakaseAudioVisualization);
}

export {
  OmakaseTimeRange,
  OmakaseVolumeRange,
  OmakaseMuteButton,
  OmakasePlayButton,
  OmakaseFullscreenButton,
  OmakaseTimeDisplay,
  OmakasePreviewThumbnail,
  OmakaseTimecodeEdit,
  OmakaseDropdown,
  OmakaseDropdownList,
  OmakaseDropdownToggle,
  OmakaseDropdownOption,
  OmakaseMarkerTrack,
  OmakaseMarkerBar,
  OmakaseAudioVisualization,
};
