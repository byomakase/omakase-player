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

import {MediaChromeButton} from 'media-chrome';
import {getPlayerAudioApi, type PlayerApi, type PlayerDetachedApi} from '../player/player-api';
import {PlayerAudioType} from '../player/player-audio';
import {AUDIO_DEFAULTS} from '../constants';
import {OmakaseTimeSkipButton} from '../chroming/components/omakase-time-skip-button';
import {OmakasePlaybackRateSelector} from '../chroming/components/omakase-playback-rate-selector';
import {OmakaseTimeDisplay, OmakaseTimeDisplayAttributes} from '../chroming/components/omakase-time-display';
import {ControlBarComponentAttributes, isShortcutEnabled} from './control-bar-component';
import {OmakaseSegmentationButtonAttributes} from '../segmentation/components/base-segmentation-button';

const VOLUME_STEP = 0.1;

/**
 * Actions performed by the control bar's keyboard shortcuts
 */
export enum ControlBarShortcutAction {
  PLAY_BUTTON = 'PLAY_BUTTON',
  RESET_PLAYBACK_RATE = 'RESET_PLAYBACK_RATE',
  FRAME_FORWARD = 'FRAME_FORWARD',
  FRAME_BACKWARD = 'FRAME_BACKWARD',
  TEN_FRAMES_FORWARD = 'TEN_FRAMES_FORWARD',
  TEN_FRAMES_BACKWARD = 'TEN_FRAMES_BACKWARD',
  PLAYBACK_RATE_UP = 'PLAYBACK_RATE_UP',
  PLAYBACK_RATE_DOWN = 'PLAYBACK_RATE_DOWN',
  VOLUME_RANGE_UP = 'VOLUME_RANGE_UP',
  VOLUME_RANGE_DOWN = 'VOLUME_RANGE_DOWN',
  MUTE_BUTTON = 'MUTE_BUTTON',
  CAPTIONS_TOGGLE = 'CAPTIONS_TOGGLE',
  FULLSCREEN_BUTTON = 'FULLSCREEN_BUTTON',
  VU_METER_TOGGLE = 'VU_METER_TOGGLE',
  TIME_TOGGLE = 'TIME_TOGGLE',
  HOME_BUTTON = 'HOME_BUTTON',
  END_BUTTON = 'END_BUTTON',
  REWIND_AND_PLAY_BUTTON = 'REWIND_AND_PLAY_BUTTON',
  PLAY_AND_REWIND_BUTTON = 'PLAY_AND_REWIND_BUTTON',
  PLAYHEAD_TO_MARKER_START_BUTTON = 'PLAYHEAD_TO_MARKER_START_BUTTON',
  PLAYHEAD_TO_MARKER_END_BUTTON = 'PLAYHEAD_TO_MARKER_END_BUTTON',
  CREATE_MARKER_BUTTON = 'CREATE_MARKER_BUTTON',
  DELETE_MARKER_BUTTON = 'DELETE_MARKER_BUTTON',
  NEXT_MARKER_BUTTON = 'NEXT_MARKER_BUTTON',
  PREVIOUS_MARKER_BUTTON = 'PREVIOUS_MARKER_BUTTON',
  LOOP_ON_MARKER_BUTTON = 'LOOP_ON_MARKER_BUTTON',
  SPLIT_MARKER_BUTTON = 'SPLIT_MARKER_BUTTON',
  MARK_IN_BUTTON = 'MARK_IN_BUTTON',
  MARK_OUT_BUTTON = 'MARK_OUT_BUTTON',
  TIME_DISPLAY = 'TIME_DISPLAY',
  KEYFRAME_BUTTON = 'KEYFRAME_BUTTON',
  SAFE_ZONE_TOGGLE = 'SAFE_ZONE_TOGGLE',
}

/**
 * Operating systems a keyboard shortcut can be limited to
 */
export enum ControlBarShortcutOs {
  MACOS = 'MACOS',
  WINDOWS = 'WINDOWS',
  LINUX = 'LINUX',
}

/**
 * A key, with the modifiers that have to be held down with it
 */
export interface ControlBarShortcutKey {
  /** The key's [`KeyboardEvent.code`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code), e.g. `KeyM`, `Digit1` or `ArrowLeft` */
  code: string;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
  /** `Cmd` on macOS, `Ctrl` elsewhere */
  mod?: boolean;
  /** The operating system the key is limited to. The key works on every operating system when not set */
  os?: ControlBarShortcutOs;
}

/**
 * A key, either as a {@link ControlBarShortcutKey}, or as a string of `+`-separated modifiers followed by the key, e.g.
 * `'Shift+M'` or `'Mod+ArrowLeft'`. See {@link parseShortcutKey}.
 */
export type ControlBarShortcutBinding = string | ControlBarShortcutKey;

/**
 * Keys of the keyboard shortcuts, by action. An action given here is triggered only by the given key(s), or by no key
 * when given `null` or `[]`; other actions keep their default keys. An action whose keys are all limited to other
 * operating systems keeps its default key on the current one.
 */
export type ControlBarKeyboardShortcuts = Partial<Record<ControlBarShortcutAction, ControlBarShortcutBinding | ControlBarShortcutBinding[] | null>>;

interface ShortcutKey {
  code: string;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
}

/** A key bound to a shortcut, for a single control bar. */
export interface ControlBarShortcutBindingEntry {
  readonly key: ShortcutKey;
  readonly shortcut: ControlBarShortcut;
}

export interface ControlBarShortcutTarget {
  readonly element: HTMLElement;
  readonly player: PlayerApi | PlayerDetachedApi;
  /** In order of precedence. */
  readonly bindings: ControlBarShortcutBindingEntry[];
}

interface ControlBarShortcut {
  action: ControlBarShortcutAction;
  /** Default key, on the current platform. */
  key: (isMac: boolean) => ShortcutKey;
  /** Whether holding the key down keeps triggering the shortcut. */
  repeatable?: boolean;
  /** Returns the action to perform on `target`, or `undefined` if `target` lacks the capability (or it's currently inactive). */
  resolve: (target: ControlBarShortcutTarget) => (() => void) | undefined;
}

const isEnabled = (element: Element) => isShortcutEnabled(element) && !element.hasAttribute(OmakaseSegmentationButtonAttributes.INACTIVE);

/** Whether the component has a single action of its own, which its `shortcut` attribute can give a key to. */
const hasComponentAction = (element: Element) => element instanceof MediaChromeButton || element instanceof OmakaseTimeDisplay;

/** Whether the component's action is triggered by its own `shortcut` attribute, rather than by the action's key. */
const hasComponentShortcut = (element: Element) => element.hasAttribute(ControlBarComponentAttributes.SHORTCUT) && hasComponentAction(element);

/** Whether the action's key triggers the component's action. */
const isActionKeyEnabled = (element: Element) => isEnabled(element) && !hasComponentShortcut(element);

const findButton = (target: ControlBarShortcutTarget, selector: string, filter: (element: Element) => boolean = isActionKeyEnabled): MediaChromeButton | undefined =>
  Array.from(target.element.querySelectorAll<MediaChromeButton>(selector)).find(filter);

const clickButton =
  (selector: string) =>
  (target: ControlBarShortcutTarget): (() => void) | undefined => {
    const button = findButton(target, selector);
    return button ? () => button.handleClick(undefined) : undefined;
  };

const skipFrames =
  (amount: number) =>
  (target: ControlBarShortcutTarget): (() => void) | undefined => {
    const button = Array.from(target.element.querySelectorAll('omakase-time-skip-button')).find(
      (element): element is OmakaseTimeSkipButton => element instanceof OmakaseTimeSkipButton && element.unit === 'frame' && element.amount === amount && isActionKeyEnabled(element)
    );
    return button ? () => button.handleClick() : undefined;
  };

const changePlaybackRate =
  (direction: 1 | -1) =>
  (target: ControlBarShortcutTarget): (() => void) | undefined => {
    const selector = Array.from(target.element.querySelectorAll('omakase-playback-rate-selector')).find(isEnabled);
    if (!(selector instanceof OmakasePlaybackRateSelector)) {
      return undefined;
    }
    return () => {
      const current = target.player.playerSession.playback.playbackRate;
      const rates = selector.rates;
      const next = direction > 0 ? rates.find((rate) => rate > current) : rates.reverse().find((rate) => rate < current);
      if (next !== undefined) {
        target.player.setPlaybackRate(next);
      }
    };
  };

const hasVolumeCapability = (target: ControlBarShortcutTarget) =>
  Array.from(target.element.querySelectorAll('omakase-mute-button, omakase-volume-range')).some(
    (element) => isEnabled(element) && !(element.localName === 'omakase-volume-range' && element.parentElement?.localName === 'omakase-mute-button')
  );

const changeVolume =
  (direction: 1 | -1) =>
  (target: ControlBarShortcutTarget): (() => void) | undefined => {
    if (!hasVolumeCapability(target)) {
      return undefined;
    }
    return () => {
      const audio = getPlayerAudioApi(target.player);
      const current = audio.getHandler(PlayerAudioType.OUTPUT)?.volume ?? AUDIO_DEFAULTS.volume;
      const next = Math.min(1, Math.max(0, Math.round((current + direction * VOLUME_STEP) * 10) / 10));
      audio.setVolume(next);
    };
  };

const hasMuteCapability = (target: ControlBarShortcutTarget) =>
  Array.from(target.element.querySelectorAll('omakase-mute-button, omakase-volume-range')).some((element) =>
    element.localName === 'omakase-mute-button' ? isActionKeyEnabled(element) : isEnabled(element) && element.parentElement?.localName !== 'omakase-mute-button'
  );

const toggleMuted = (target: ControlBarShortcutTarget): (() => void) | undefined => (hasMuteCapability(target) ? () => getPlayerAudioApi(target.player).toggleMuted() : undefined);

const editTimeOf = (target: ControlBarShortcutTarget, display: OmakaseTimeDisplay): (() => void) | undefined =>
  target.player.isMainMediaLoaded && display.hasAttribute(OmakaseTimeDisplayAttributes.EDITABLE) && display.checkVisibility() ? () => display.enableEditMode() : undefined;

const editTime = (target: ControlBarShortcutTarget): (() => void) | undefined => {
  if (!target.player.isMainMediaLoaded) {
    return undefined;
  }
  const display = Array.from(target.element.querySelectorAll(`omakase-time-display[${OmakaseTimeDisplayAttributes.EDITABLE}]`)).find(
    (element): element is OmakaseTimeDisplay => element instanceof OmakaseTimeDisplay && isActionKeyEnabled(element) && element.checkVisibility()
  );
  return display ? editTimeOf(target, display) : undefined;
};

const resetPlaybackRateAndPause = (target: ControlBarShortcutTarget): (() => void) | undefined => {
  if (!findButton(target, 'omakase-play-button', isEnabled)) {
    return undefined;
  }
  return () => {
    target.player.pause();
    target.player.setPlaybackRate(1);
  };
};

const shortcuts: ControlBarShortcut[] = [
  {action: ControlBarShortcutAction.PLAY_BUTTON, key: () => ({code: 'Space'}), resolve: clickButton('omakase-play-button')},
  {action: ControlBarShortcutAction.RESET_PLAYBACK_RATE, key: () => ({code: 'KeyK'}), resolve: resetPlaybackRateAndPause},
  {action: ControlBarShortcutAction.FRAME_FORWARD, key: () => ({code: 'ArrowRight'}), repeatable: true, resolve: skipFrames(1)},
  {action: ControlBarShortcutAction.FRAME_BACKWARD, key: () => ({code: 'ArrowLeft'}), repeatable: true, resolve: skipFrames(-1)},
  {action: ControlBarShortcutAction.TEN_FRAMES_FORWARD, key: () => ({code: 'ArrowRight', shift: true}), repeatable: true, resolve: skipFrames(10)},
  {action: ControlBarShortcutAction.TEN_FRAMES_BACKWARD, key: () => ({code: 'ArrowLeft', shift: true}), repeatable: true, resolve: skipFrames(-10)},
  {action: ControlBarShortcutAction.PLAYBACK_RATE_UP, key: () => ({code: 'KeyL', shift: true}), resolve: changePlaybackRate(1)},
  {action: ControlBarShortcutAction.PLAYBACK_RATE_DOWN, key: () => ({code: 'KeyL'}), resolve: changePlaybackRate(-1)},
  {action: ControlBarShortcutAction.VOLUME_RANGE_UP, key: () => ({code: 'Backslash', shift: true}), repeatable: true, resolve: changeVolume(1)},
  {action: ControlBarShortcutAction.VOLUME_RANGE_DOWN, key: () => ({code: 'Backslash'}), repeatable: true, resolve: changeVolume(-1)},
  {action: ControlBarShortcutAction.MUTE_BUTTON, key: () => ({code: 'KeyS'}), resolve: toggleMuted},
  {action: ControlBarShortcutAction.CAPTIONS_TOGGLE, key: () => ({code: 'KeyD'}), resolve: clickButton('omakase-captions-toggle')},
  {action: ControlBarShortcutAction.FULLSCREEN_BUTTON, key: () => ({code: 'KeyF'}), resolve: clickButton('omakase-fullscreen-button')},
  {action: ControlBarShortcutAction.VU_METER_TOGGLE, key: () => ({code: 'KeyG'}), resolve: clickButton('omakase-vu-meter-toggle')},
  {action: ControlBarShortcutAction.TIME_TOGGLE, key: () => ({code: 'KeyB'}), resolve: clickButton('omakase-time-toggle')},
  {action: ControlBarShortcutAction.HOME_BUTTON, key: () => ({code: 'Home'}), resolve: clickButton('omakase-home-button')},
  {action: ControlBarShortcutAction.END_BUTTON, key: () => ({code: 'End'}), resolve: clickButton('omakase-end-button')},
  {action: ControlBarShortcutAction.REWIND_AND_PLAY_BUTTON, key: (isMac) => ({code: 'ArrowLeft', meta: isMac, ctrl: !isMac}), resolve: clickButton('omakase-rewind-and-play-button')},
  {action: ControlBarShortcutAction.PLAY_AND_REWIND_BUTTON, key: (isMac) => ({code: 'ArrowRight', meta: isMac, ctrl: !isMac}), resolve: clickButton('omakase-play-and-rewind-button')},
  {action: ControlBarShortcutAction.PLAYHEAD_TO_MARKER_START_BUTTON, key: () => ({code: 'KeyI', shift: true}), resolve: clickButton('omakase-playhead-to-marker-start-button')},
  {action: ControlBarShortcutAction.PLAYHEAD_TO_MARKER_END_BUTTON, key: () => ({code: 'KeyO', shift: true}), resolve: clickButton('omakase-playhead-to-marker-end-button')},
  {action: ControlBarShortcutAction.CREATE_MARKER_BUTTON, key: () => ({code: 'KeyM'}), resolve: clickButton('omakase-create-marker-button')},
  {action: ControlBarShortcutAction.DELETE_MARKER_BUTTON, key: (isMac) => ({code: 'KeyM', alt: true, ctrl: !isMac}), resolve: clickButton('omakase-delete-marker-button')},
  {action: ControlBarShortcutAction.NEXT_MARKER_BUTTON, key: () => ({code: 'KeyM', shift: true}), resolve: clickButton('omakase-next-marker-button')},
  {action: ControlBarShortcutAction.PREVIOUS_MARKER_BUTTON, key: () => ({code: 'KeyM', ctrl: true, shift: true}), resolve: clickButton('omakase-previous-marker-button')},
  {action: ControlBarShortcutAction.LOOP_ON_MARKER_BUTTON, key: () => ({code: 'KeyR'}), resolve: clickButton('omakase-loop-on-marker-button')},
  {action: ControlBarShortcutAction.SPLIT_MARKER_BUTTON, key: () => ({code: 'KeyP'}), resolve: clickButton('omakase-split-marker-button')},
  {action: ControlBarShortcutAction.MARK_IN_BUTTON, key: () => ({code: 'KeyI'}), resolve: clickButton('omakase-mark-in-button')},
  {action: ControlBarShortcutAction.MARK_OUT_BUTTON, key: () => ({code: 'KeyO'}), resolve: clickButton('omakase-mark-out-button')},
  {action: ControlBarShortcutAction.TIME_DISPLAY, key: () => ({code: 'Quote'}), resolve: editTime},
  {action: ControlBarShortcutAction.KEYFRAME_BUTTON, key: () => ({code: 'KeyK', alt: true}), resolve: clickButton('omakase-keyframe-button')},
  {action: ControlBarShortcutAction.SAFE_ZONE_TOGGLE, key: () => ({code: 'KeyS', shift: true}), resolve: clickButton('omakase-safe-zone-toggle')},
];

/** The current operating system, as far as `navigator.platform` tells; iOS counts as macOS, Android as Linux. */
const detectOs = (): ControlBarShortcutOs | undefined => {
  const platform = navigator.platform;
  if (/Mac|iPhone|iPad|iPod/.test(platform)) {
    return ControlBarShortcutOs.MACOS;
  }
  if (/Win/.test(platform)) {
    return ControlBarShortcutOs.WINDOWS;
  }
  if (/Linux|X11/.test(platform)) {
    return ControlBarShortcutOs.LINUX;
  }
  return undefined;
};

/** Time skip buttons repeat while their key is held down, like the frame stepping shortcuts. */
const isRepeatableComponent = (element: Element) => element instanceof OmakaseTimeSkipButton;

const resolveComponentAction = (target: ControlBarShortcutTarget, element: Element): (() => void) | undefined => {
  if (!isEnabled(element)) {
    return undefined;
  }
  if (element instanceof OmakaseTimeDisplay) {
    return editTimeOf(target, element);
  }
  if (element instanceof MediaChromeButton) {
    return () => element.handleClick(undefined);
  }
  return undefined;
};

const NON_TEXT_INPUT_TYPES = ['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image'];

const matchesKey = (event: KeyboardEvent, key: ShortcutKey): boolean =>
  event.code === key.code && event.shiftKey === !!key.shift && event.ctrlKey === !!key.ctrl && event.altKey === !!key.alt && event.metaKey === !!key.meta;

const isSameKey = (a: ShortcutKey, b: ShortcutKey): boolean => a.code === b.code && !!a.shift === !!b.shift && !!a.ctrl === !!b.ctrl && !!a.alt === !!b.alt && !!a.meta === !!b.meta;

const MODIFIERS: Record<string, keyof Omit<ControlBarShortcutKey, 'code' | 'os'>> = {
  shift: 'shift',
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  mod: 'mod',
};

/**
 * Parses a key given as a string of `+`-separated, case-insensitive modifiers (`Shift`, `Ctrl` / `Control`, `Alt` /
 * `Option`, `Meta` / `Cmd` / `Command`, or `Mod` for `Cmd` on macOS and `Ctrl` elsewhere), followed by the key's
 * `KeyboardEvent.code`. A single letter or digit stands for its key, e.g. `M` for `KeyM` and `1` for `Digit1`.
 */
export const parseShortcutKey = (binding: string): ControlBarShortcutKey => {
  const parts = binding.split('+').map((part) => part.trim());
  const keyPart = parts.pop();
  if (!keyPart) {
    throw new Error(`Invalid keyboard shortcut "${binding}": no key given`);
  }
  const key: ControlBarShortcutKey = {code: /^[a-z]$/i.test(keyPart) ? `Key${keyPart.toUpperCase()}` : /^\d$/.test(keyPart) ? `Digit${keyPart}` : keyPart};
  for (const part of parts) {
    const modifier = MODIFIERS[part.toLowerCase()];
    if (!modifier) {
      throw new Error(`Invalid keyboard shortcut "${binding}": unknown modifier "${part}"`);
    }
    key[modifier] = true;
  }
  return key;
};

const componentKeys = new Map<string, ShortcutKey | undefined>();

/**
 * Parses a component's `shortcut` attribute like a key string given in `keyboardShortcuts`. An empty attribute means no key,
 * and an invalid one is reported once and ignored.
 */
const toComponentKey = (shortcut: string): ShortcutKey | undefined => {
  if (!componentKeys.has(shortcut)) {
    let key: ShortcutKey | undefined;
    if (shortcut.trim()) {
      try {
        key = toShortcutKey(shortcut, detectOs());
      } catch (error) {
        console.warn(error);
      }
    }
    componentKeys.set(shortcut, key);
  }
  return componentKeys.get(shortcut);
};

const toShortcutKey = (binding: ControlBarShortcutBinding, os: ControlBarShortcutOs | undefined): ShortcutKey | undefined => {
  const key = typeof binding === 'string' ? parseShortcutKey(binding) : binding;
  if (!key.code) {
    throw new Error(`Invalid keyboard shortcut ${JSON.stringify(binding)}: no key code given`);
  }
  if (key.os !== undefined && !Object.values(ControlBarShortcutOs).includes(key.os)) {
    throw new Error(`Invalid keyboard shortcut ${JSON.stringify(binding)}: unknown os "${key.os}"`);
  }
  if (key.os !== undefined && key.os !== os) {
    return undefined;
  }
  const isMac = os === ControlBarShortcutOs.MACOS;
  return {code: key.code, shift: !!key.shift, ctrl: !!key.ctrl || (!!key.mod && !isMac), alt: !!key.alt, meta: !!key.meta || (!!key.mod && isMac)};
};

/**
 * Builds the key bindings of a control bar: the keys given in `keyboardShortcuts` for the actions it remaps, and the
 * default keys for the others. A remapped key takes precedence over another action's default key.
 */
export const createShortcutBindings = (keyboardShortcuts: ControlBarKeyboardShortcuts = {}): ControlBarShortcutBindingEntry[] => {
  const os = detectOs();
  const remapped: ControlBarShortcutBindingEntry[] = [];
  const defaults: ControlBarShortcutBindingEntry[] = [];
  for (const shortcut of shortcuts) {
    const bindings = keyboardShortcuts[shortcut.action];
    const givenBindings = bindings === undefined ? undefined : bindings === null ? [] : Array.isArray(bindings) ? bindings : [bindings];
    const keys = givenBindings?.map((binding) => toShortcutKey(binding, os));
    const osKeys = keys?.filter((key): key is ShortcutKey => key !== undefined);
    if (keys && osKeys && (osKeys.length > 0 || keys.length === 0)) {
      osKeys.forEach((key) => remapped.push({key, shortcut}));
    } else {
      defaults.push({key: shortcut.key(os === ControlBarShortcutOs.MACOS), shortcut});
    }
  }
  return [...remapped, ...defaults.filter((entry) => !remapped.some((other) => isSameKey(other.key, entry.key)))];
};

/**
 * Whether the element the event originated from handles the key itself - text entry, or Space/Enter
 * activating a focused button - so it shouldn't also trigger a shortcut.
 */
const isHandledByOrigin = (event: KeyboardEvent): boolean => {
  const origin = event.composedPath()[0];
  if (!(origin instanceof HTMLElement)) {
    return false;
  }
  if (origin.isContentEditable || origin instanceof HTMLTextAreaElement || origin instanceof HTMLSelectElement) {
    return true;
  }
  if (origin instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.includes(origin.type)) {
    return true;
  }
  return (event.code === 'Space' || event.code === 'Enter') && (origin instanceof HTMLButtonElement || origin.getAttribute('role') === 'button');
};

export class ControlBarShortcutRegistry {
  private static _targets: ControlBarShortcutTarget[] = [];

  static register(target: ControlBarShortcutTarget): void {
    if (this._targets.includes(target)) {
      return;
    }
    this._targets.push(target);
    if (this._targets.length === 1) {
      document.addEventListener('keydown', this.onKeyDown, true);
    }
  }

  static unregister(target: ControlBarShortcutTarget): void {
    this._targets = this._targets.filter((registered) => registered !== target);
    if (this._targets.length === 0) {
      document.removeEventListener('keydown', this.onKeyDown, true);
    }
  }

  private static onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || isHandledByOrigin(event)) {
      return;
    }
    for (const target of ControlBarShortcutRegistry._targets) {
      if (!target.element.isConnected) {
        continue;
      }
      for (const element of Array.from(target.element.querySelectorAll(`[${ControlBarComponentAttributes.SHORTCUT}]`))) {
        const key = hasComponentAction(element) ? toComponentKey(element.getAttribute(ControlBarComponentAttributes.SHORTCUT)!) : undefined;
        if (!key || !matchesKey(event, key)) {
          continue;
        }
        const action = resolveComponentAction(target, element);
        if (action) {
          event.preventDefault();
          if (!event.repeat || isRepeatableComponent(element)) {
            action();
          }
          return;
        }
      }
      for (const {key, shortcut} of target.bindings) {
        if (!matchesKey(event, key)) {
          continue;
        }
        const action = shortcut.resolve(target);
        if (action) {
          event.preventDefault();
          if (!event.repeat || shortcut.repeatable) {
            action();
          }
          return;
        }
      }
    }
  };
}
