import {OmakaseTimeRange} from './omakase-time-range';
import {OmakaseTimeDisplay} from './omakase-time-display';
import {OmakasePreviewThumbnail} from './omakase-preview-thumbnail';
import {OmakaseTimecodeEdit} from './omakase-timecode-edit';

if (!globalThis.customElements.get('omakase-time-range')) {
  globalThis.customElements.define('omakase-time-range', OmakaseTimeRange);
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

export {OmakaseTimeRange, OmakaseTimeDisplay, OmakasePreviewThumbnail, OmakaseTimecodeEdit};
