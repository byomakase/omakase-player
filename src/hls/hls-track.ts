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

import {
  Audio,
  type AudioArgs,
  type AudioState,
  AudioType,
  BaseTextCue,
  BaseTextTrack,
  type TextCue,
  type TextTrackArgs,
  type TextTrackEvent,
  type TextTrackKind,
  type TextTrackState,
  TextTrackType,
  type TrackUpdateableAttrs,
  Video,
  type VideoArgs,
  type VideoState,
  VideoType,
} from '../media';
import type {MediaPlaylist} from 'hls.js';
import {isNullOrUndefined} from '../util/util-functions';

export interface HlsVideoState extends VideoState {
  levels?: HlsVideoLevel[] | undefined;
}

export interface HlsVideoLevel {
  index: number;
  id: number;
  url: string | undefined;
  bitrate: number;
}

export interface HlsVideoArgs extends VideoArgs {
  levels?: HlsVideoLevel[] | undefined;
}

export class HlsVideo extends Video {
  protected _videoType: VideoType = VideoType.HLS_VIDEO;

  protected readonly _levels: HlsVideoLevel[] | undefined;

  constructor(args: HlsVideoArgs) {
    super({
      ...args,
    });

    this._levels = args?.levels;
  }

  updateAttrs(attrs: TrackUpdateableAttrs) {
    super.updateAttrs(attrs);
  }

  protected getState(): HlsVideoState {
    return {
      ...super.getState(),
      levels: this._levels,
    };
  }

  get levels(): HlsVideoLevel[] | undefined {
    return this._levels;
  }
}

type HlsMediaPlaylistArgs = {
  type: MediaPlaylist['type'];
  id: MediaPlaylist['id'];
  url: MediaPlaylist['url'];
  audioCodec: MediaPlaylist['audioCodec'];
  channels: MediaPlaylist['channels'];
  name: MediaPlaylist['name'];
  default: MediaPlaylist['default'];
  autoselect: MediaPlaylist['autoselect'];
  lang: MediaPlaylist['lang'];
  forced: MediaPlaylist['forced'];
  instreamId: MediaPlaylist['instreamId'];
  characteristics: MediaPlaylist['characteristics'];
};

export interface HlsAudioState extends AudioState {
  mediaPlaylist: HlsMediaPlaylistArgs;
}

export interface HlsAudioArgs extends Omit<AudioArgs, 'url'> {
  mediaPlaylist: HlsMediaPlaylistArgs;
}

export class HlsAudio extends Audio {
  protected _audioType: AudioType = AudioType.HLS_AUDIO;

  protected _mediaPlaylist: HlsMediaPlaylistArgs;

  constructor(args: HlsAudioArgs) {
    super({
      ...args,
      audioCodec: args.mediaPlaylist.audioCodec,
      channels: isNullOrUndefined(args.mediaPlaylist.channels) ? void 0 : parseInt(args.mediaPlaylist.channels!),
      url: args.mediaPlaylist.url,
      label: args.mediaPlaylist.name,
    });

    this._mediaPlaylist = args.mediaPlaylist;
  }

  protected getState(): HlsAudioState {
    return {
      ...super.getState(),
      mediaPlaylist: this._mediaPlaylist,
    };
  }

  get mediaPlaylist(): HlsAudioArgs['mediaPlaylist'] {
    return this._mediaPlaylist;
  }
}

export interface HlsTextTrackState extends TextTrackState {
  mediaPlaylist: HlsMediaPlaylistArgs;
}

export interface HlsTextTrackArgs extends Omit<TextTrackArgs, 'url'> {
  mediaPlaylist: HlsMediaPlaylistArgs;
}

export class HlsTextTrack extends BaseTextTrack<TextCue, BaseTextCue, HlsTextTrackState, TextTrackEvent> {
  protected _textTrackType: TextTrackType = TextTrackType.HLS_TEXT_TRACK;

  protected _mediaPlaylist: HlsMediaPlaylistArgs;

  constructor(args: HlsTextTrackArgs) {
    super({
      ...args,
      label: args.mediaPlaylist.name,
      kind: HlsTextTrack.resolveKind(args.mediaPlaylist.type),
    });

    this._mediaPlaylist = args.mediaPlaylist;
  }

  get mediaPlaylist(): HlsMediaPlaylistArgs {
    return this._mediaPlaylist;
  }

  static resolveKind(playlistType: HlsMediaPlaylistArgs['type']): TextTrackKind {
    if (playlistType === 'CLOSED-CAPTIONS') {
      return 'captions';
    } else {
      return 'subtitles';
    }
  }

  protected getState(): HlsTextTrackState {
    return {
      ...super._getState(),
      mediaPlaylist: this._mediaPlaylist,
    };
  }
}
