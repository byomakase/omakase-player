import {OmakaseTimeRange} from './omakase-time-range';
import {OmakaseTimeDisplay} from './omakase-time-display';
import {OmakasePreviewThumbnail} from './omakase-preview-thumbnail';
import {OmakaseTimecodeEdit} from './omakase-timecode-edit';
import {OmakaseDropdown} from './omakase-dropdown';
import {OmakaseDropdownToggle} from './omakase-dropdown-toggle';
import {OmakaseDropdownOption} from './omakase-dropdown-option';
import {OmakaseVolumeRange} from './omakase-volume-range';
import {OmakaseMuteButton} from './omakase-mute-button';

if (!globalThis.customElements.get('omakase-time-range')) {
  globalThis.customElements.define('omakase-time-range', OmakaseTimeRange);
}

if (!globalThis.customElements.get('omakase-volume-range')) {
  globalThis.customElements.define('omakase-volume-range', OmakaseVolumeRange);
}

if (!globalThis.customElements.get('omakase-mute-button')) {
  globalThis.customElements.define('omakase-mute-button', OmakaseMuteButton);
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

if (!globalThis.customElements.get('omakase-dropdown-toggle')) {
  globalThis.customElements.define('omakase-dropdown-toggle', OmakaseDropdownToggle);
}

if (!globalThis.customElements.get('omakase-dropdown-option')) {
  globalThis.customElements.define('omakase-dropdown-option', OmakaseDropdownOption);
}

export {OmakaseTimeRange, OmakaseTimeDisplay, OmakasePreviewThumbnail, OmakaseTimecodeEdit};
