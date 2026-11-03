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

import {OmakasePlayheadToMarkerStartButton} from './omakase-playhead-to-marker-start-button';
import {OmakasePlayheadToMarkerEndButton} from './omakase-playhead-to-marker-end-button';
import {OmakaseCreateMarkerButton} from './omakase-create-marker-button';
import {OmakaseDeleteMarkerButton} from './omakase-delete-marker-button';
import {OmakaseNextMarkerButton} from './omakase-next-marker-button';
import {OmakasePreviousMarkerButton} from './omakase-previous-marker-button';
import {OmakaseLoopOnMarkerButton} from './omakase-loop-on-marker-button';
import {OmakaseSplitMarkerButton} from './omakase-split-marker-button';
import {OmakaseMarkInButton} from './omakase-mark-in-button';
import {OmakaseMarkOutButton} from './omakase-mark-out-button';
import {OmakaseColorSelectorButton} from './omakase-color-selector-button';

if (!globalThis.customElements.get('omakase-playhead-to-marker-start-button')) {
  globalThis.customElements.define('omakase-playhead-to-marker-start-button', OmakasePlayheadToMarkerStartButton);
}

if (!globalThis.customElements.get('omakase-playhead-to-marker-end-button')) {
  globalThis.customElements.define('omakase-playhead-to-marker-end-button', OmakasePlayheadToMarkerEndButton);
}

if (!globalThis.customElements.get('omakase-create-marker-button')) {
  globalThis.customElements.define('omakase-create-marker-button', OmakaseCreateMarkerButton);
}

if (!globalThis.customElements.get('omakase-delete-marker-button')) {
  globalThis.customElements.define('omakase-delete-marker-button', OmakaseDeleteMarkerButton);
}

if (!globalThis.customElements.get('omakase-next-marker-button')) {
  globalThis.customElements.define('omakase-next-marker-button', OmakaseNextMarkerButton);
}

if (!globalThis.customElements.get('omakase-previous-marker-button')) {
  globalThis.customElements.define('omakase-previous-marker-button', OmakasePreviousMarkerButton);
}

if (!globalThis.customElements.get('omakase-loop-on-marker-button')) {
  globalThis.customElements.define('omakase-loop-on-marker-button', OmakaseLoopOnMarkerButton);
}

if (!globalThis.customElements.get('omakase-split-marker-button')) {
  globalThis.customElements.define('omakase-split-marker-button', OmakaseSplitMarkerButton);
}

if (!globalThis.customElements.get('omakase-mark-in-button')) {
  globalThis.customElements.define('omakase-mark-in-button', OmakaseMarkInButton);
}

if (!globalThis.customElements.get('omakase-mark-out-button')) {
  globalThis.customElements.define('omakase-mark-out-button', OmakaseMarkOutButton);
}

if (!globalThis.customElements.get('omakase-color-selector-button')) {
  globalThis.customElements.define('omakase-color-selector-button', OmakaseColorSelectorButton);
}

export {
  OmakasePlayheadToMarkerStartButton,
  OmakasePlayheadToMarkerEndButton,
  OmakaseCreateMarkerButton,
  OmakaseDeleteMarkerButton,
  OmakaseNextMarkerButton,
  OmakasePreviousMarkerButton,
  OmakaseLoopOnMarkerButton,
  OmakaseSplitMarkerButton,
  OmakaseMarkInButton,
  OmakaseMarkOutButton,
  OmakaseColorSelectorButton,
};
