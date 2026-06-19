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

import {type BaseTrackArgs, type BaseTrackLoadOptions, type Track, TrackType, type TrackUpdateableAttrs} from './track';
import {
  BaseTimedItem,
  BaseTimedItemsTrack,
  type TimedItem,
  type TimedItemArgs,
  type TimedItemState,
  type TimedItemsTrack,
  type TimedItemsTrackState,
  type TimedItemUpdateableAttrs,
} from './timed-items-track';
import {FileFormatType, type OmpEventGroup} from '../common';

/**
 * Discriminator for the origin of a text track.
 */
export enum TextTrackType {
  /** Standalone text track file loaded as a sidecar (e.g. VTT, SRT). */
  TEXT_TRACK_FILE = 'TEXT_TRACK_FILE',
  /** Text track rendition extracted from an HLS manifest. */
  HLS_TEXT_TRACK = 'HLS_TEXT_TRACK',
}

export type OutputTextFileFormatType = FileFormatType.VTT | FileFormatType.SRT | FileFormatType.TTML;

/**
 * Mirrors the HTML `<track>` element's `kind` attribute.
 */
export type TextTrackKind = 'subtitles' | 'captions' | 'descriptions' | 'chapters' | 'metadata';

export interface TextTrackConversionOptions {
  label?: string | undefined;
  outputFormat?: OutputTextFileFormatType | undefined;
  slewOptions?: SlewOptions | undefined;
}

export interface SlewOptions {
  timeSlew: number;
  expectedFrameRate?: number | string;
}

export enum TimeReference {
  FFOM = 'FFOM',
  SELF = 'SELF',
}

export enum FallbackFormat {
  NONE = 'NONE',
  VTT = FileFormatType.VTT,
  SRT = FileFormatType.SRT,
  TTML = FileFormatType.TTML,
}

/** Load options for text tracks. */
export interface TextTrackLoadOptions extends BaseTrackLoadOptions {
  args?: TextTrackArgs;
}

/**
 * Serializable snapshot of a text track {@link Track}.
 */
export interface TextTrackState extends TimedItemsTrackState<TextCueState> {
  textTrackType: TextTrackType;

  kind: TextTrackKind | undefined;
  /** BCP 47 language tag for the text track (e.g. `"en"`, `"fr"`). */
  srclang?: string | undefined;
  /** Whether this text track is selected by default. */
  default: boolean;
}

export interface TextTrack<S extends TextTrackState = TextTrackState, E extends OmpEventGroup<any, any> = never> extends TimedItemsTrack<TextCue, S, TextCueUpdateableAttrs, E> {
  textTrackType: TextTrackType;
}

export enum TextTrackEventType {
  TEXT_TRACK_SPECIFIC_EVENT_PLACEHOLDER = 'TEXT_TRACK_SPECIFIC_EVENT_PLACEHOLDER',
}

export interface TextTrackEventData {}

export type TextTrackEventTypeDataMap = {
  [TextTrackEventType.TEXT_TRACK_SPECIFIC_EVENT_PLACEHOLDER]: TextTrackEventData;
};

export type TextTrackEvent = OmpEventGroup<TextTrackEventType, TextTrackEventTypeDataMap>;

/**
 * Construction arguments for text track instances.
 */
export interface TextTrackArgs extends BaseTrackArgs {
  /** The kind of text track (subtitles, captions, etc.). */
  kind?: TextTrackKind | undefined;
  /** BCP 47 language tag (e.g. `"en"`). */
  srclang?: string | undefined;
  /** Whether this track should be selected by default. */
  default?: boolean;
}

/**
 * Subset of {@link TextTrackState} fields that can be updated at runtime.
 */
export type TextTrackUpdateableAttrs = TrackUpdateableAttrs;

export interface TextCueState extends TimedItemState {
  text: string;
}

export interface TextCue extends TimedItem<TextCueState> {
  text: string;
}

export abstract class BaseTextTrack<T extends TextCue, TM extends T & BaseTextCue, S extends TextTrackState, E extends OmpEventGroup<any, any> = never>
  extends BaseTimedItemsTrack<T, TM, S, E>
  implements TextTrack<S, E>
{
  protected _trackType = TrackType.TEXT_TRACK;

  protected abstract _textTrackType: TextTrackType;

  protected _kind: TextTrackKind | undefined;
  protected _srclang: string | undefined;
  protected _default: boolean = false;

  protected constructor(args: TextTrackArgs) {
    super(args);

    this._kind = args.kind;
    this._srclang = args.srclang;
    this._default = !!args.default;
  }

  protected _getState(): TextTrackState {
    return {
      ...super._getState(),
      textTrackType: this._textTrackType,
      kind: this._kind,
      srclang: this._srclang,
      default: this._default,
    };
  }

  get textTrackType(): TextTrackType {
    return this._textTrackType;
  }

  get kind(): TextTrackKind | undefined {
    return this._kind;
  }

  get srclang(): string | undefined {
    return this._srclang;
  }

  get default(): boolean {
    return this._default;
  }

  updateAttrs(attrs: TextTrackUpdateableAttrs) {
    super.updateAttrs(attrs);
  }
}

export class TextTrackFile extends BaseTextTrack<TextCue, BaseTextCue, TextTrackState, TextTrackEvent> {
  protected _textTrackType: TextTrackType = TextTrackType.TEXT_TRACK_FILE;

  constructor(args: TextTrackArgs) {
    super(args);
  }

  protected getState(): TextTrackState {
    return {
      ...super._getState(),
    };
  }
}

export interface DefaultTextCueState extends TextCueState {}

export interface TextCueUpdateableAttrs extends TimedItemUpdateableAttrs {
  text?: string;
}

export interface TextCueArgs extends TimedItemArgs {
  text: string;
}

export abstract class BaseTextCue extends BaseTimedItem<TextCueState, TextCueUpdateableAttrs> implements TextCue {
  protected _text: string;

  protected constructor(args: TextCueArgs) {
    super(args);
    this._text = args.text;
  }

  update(attrs: TextCueUpdateableAttrs) {
    super.update(attrs);

    if (attrs.hasOwnProperty('text') && attrs.text) {
      this._text = attrs.text;
    }
  }

  protected _getState(): TextCueState {
    return {
      ...super._getState(),
      text: this._text,
    };
  }

  get text(): string {
    return this._text;
  }
}

export class DefaultTextCue extends BaseTextCue implements TextCue {
  constructor(args: TextCueArgs) {
    super(args);
  }
}
