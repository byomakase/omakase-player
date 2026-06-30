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

import {type BaseMainMediaArgs, type MainMedia, type MainMediaState, MainMediaType} from './main-media';
import {HlsAudio, type HlsAudioState, HlsMainMedia, type HlsMainMediaState, HlsTextTrack, type HlsTextTrackState, HlsVideo, type HlsVideoState} from '../hls';
import {type Source, SourceFactory, type SourceState, SourceType, TrackSource, type TrackSourceState, UrlSource, type UrlSourceState} from '../source';
import {type BaseTrackArgs, type Track, type TrackState, TrackType} from './track';
import {Relation} from './relation';
import type {BaseMediaEntityArgs, MediaEntityState} from './media-entity';
import {isNullOrUndefined} from '../util/util-functions';
import {Mp4Audio, Mp4MainMedia, Mp4Video} from '../mp4';
import {AudioMainMedia} from '../audio/audio-file-main-media';
import {Video, type VideoArgs, type VideoState, VideoType} from './video';
import {Audio, type AudioArgs, AudioFile, type AudioState, AudioType} from './audio';
import {MarkerTrack, type MarkerTrackArgs, type MarkerTrackState} from './marker-track';
import {ThumbnailTrack, type ThumbnailTrackState} from './thumbnail-track';
import {type TextTrackArgs, TextTrackFile, type TextTrackState, TextTrackType} from './text-track';
import {OpStage, type OpStageState} from '../common/op-stage';
import type {TimedItemsTrackArgs, TimedItemsTrackState} from './timed-items-track';
import type {Destroyable} from '../common/capabilities';

export class MediaDeserializer implements Destroyable {
  constructor() {}

  static createMainMedia(state: MainMediaState): MainMedia {
    switch (state.mainMediaType) {
      case MainMediaType.HLS:
        return this.createHlsMainMedia(state);
      case MainMediaType.MP4:
        return this.createMp4MainMedia(state);
      case MainMediaType.AUDIO_FILE:
        return this.createAudioFileMainMedia(state);
      default:
        throw new Error('niy');
    }
  }

  protected static createAudioFileMainMedia(state: MainMediaState): AudioMainMedia {
    return new AudioMainMedia({
      ...this.createBaseMainMediaArgs(state),
    });
  }

  protected static createHlsMainMedia(state: HlsMainMediaState): HlsMainMedia {
    return new HlsMainMedia({
      ...this.createBaseMainMediaArgs(state),
    });
  }

  protected static createMp4MainMedia(state: MainMediaState): Mp4MainMedia {
    return new Mp4MainMedia({
      ...this.createBaseMainMediaArgs(state),
    });
  }

  protected static createBaseMainMediaArgs(state: MainMediaState): BaseMainMediaArgs {
    return {
      ...this.createBaseMediaEntityArgs(state),
      source: SourceFactory.create(state.source),
      loadOptions: state.loadOptions,
      tracks: state.tracks.map((p) => this.createTrack(p)),
      duration: state.duration,
      frameRateModel: state.frameRateModel,
      ffomTimecodeModel: state.ffomTimecodeModel,
      initSegmentTimeOffset: state.initSegmentTimeOffset,
      hasDrm: isNullOrUndefined(state.hasDrm) ? void 0 : state.hasDrm,
      hasVideo: isNullOrUndefined(state.hasVideo) ? void 0 : state.hasVideo,
      hasAudio: isNullOrUndefined(state.hasAudio) ? void 0 : state.hasAudio,
    };
  }

  static createTrack(state: TrackState): Track {
    switch (state.trackType) {
      case TrackType.VIDEO:
        return this.createVideo(state as VideoState);
      case TrackType.AUDIO:
        return this.createAudio(state as AudioState);
      case TrackType.MARKER_TRACK:
        return this.createMarkerTrack(state as MarkerTrackState);
      case TrackType.THUMBNAIL_TRACK:
        return this.createThumbnailTrack(state as ThumbnailTrackState);
      case TrackType.TEXT_TRACK:
        return this.createTextTrack(state as TextTrackState);
      default:
        throw new Error('niy -> ' + state.trackType);
    }
  }

  protected static createVideo(state: VideoState): Video {
    switch (state.videoType) {
      case VideoType.HLS_VIDEO:
        return new HlsVideo({
          ...this.createVideoArgs(state),
          levels: (state as HlsVideoState).levels,
        });
      case VideoType.MP4_VIDEO:
        return new Mp4Video({
          ...this.createVideoArgs(state),
        });
      default:
        throw new Error('niy');
    }
  }

  protected static createAudio(state: AudioState): Audio {
    switch (state.audioType) {
      case AudioType.HLS_AUDIO:
        return new HlsAudio({
          ...this.createAudioArgs(state),
          mediaPlaylist: (state as HlsAudioState).mediaPlaylist,
        });
      case AudioType.MP4_AUDIO:
        return new Mp4Audio({
          ...this.createAudioArgs(state),
        });
      case AudioType.AUDIO_FILE:
        return new AudioFile({
          ...this.createAudioArgs(state),
        });
      default:
        throw new Error('niy');
    }
  }

  protected static createMarkerTrack(state: MarkerTrackState): MarkerTrack {
    return new MarkerTrack({
      ...this.createBaseTimedItemsTrackArgs(state),
    });
  }

  protected static createTextTrack(state: TextTrackState): TextTrackFile | HlsTextTrack {
    switch (state.textTrackType) {
      case TextTrackType.TEXT_TRACK_FILE:
        return new TextTrackFile({
          ...this.createTextTrackArgs(state),
        });
      case TextTrackType.HLS_TEXT_TRACK:
        return new HlsTextTrack({
          ...this.createTextTrackArgs(state),
          mediaPlaylist: (state as HlsTextTrackState).mediaPlaylist,
        });
      default:
        throw new Error('niy');
    }
  }

  protected static createThumbnailTrack(state: ThumbnailTrackState): ThumbnailTrack {
    return new ThumbnailTrack({
      ...this.createBaseTrackArgs(state),
    });
  }

  protected static createBaseMediaEntityArgs(state: MediaEntityState): BaseMediaEntityArgs {
    return {
      id: state.id,
    };
  }

  protected static createBaseTrackArgs(state: TrackState): BaseTrackArgs {
    return {
      ...this.createBaseMediaEntityArgs(state),
      source: state.source ? this.createSource(state.source) : void 0,
      relations: state.relations ? state.relations.map((p) => Relation.fromState(p)) : undefined,
      label: state.label,
      loadStage: state.loadStage ? this.createLoadStage(state.loadStage) : void 0,
    };
  }

  protected static createAudioArgs(state: AudioState): AudioArgs {
    return {
      ...this.createBaseTrackArgs(state),
      url: state.url,
      duration: state.duration,
      audioCodec: state.audioCodec,
      channels: state.channels,
    };
  }

  protected static createVideoArgs(state: VideoState): VideoArgs {
    return {
      ...this.createBaseTrackArgs(state),
      duration: state.duration,
    };
  }

  protected static createTextTrackArgs(state: TextTrackState): TextTrackArgs {
    return {
      ...this.createBaseTimedItemsTrackArgs(state),
      kind: state.kind,
      srclang: state.srclang,
      default: state.default,
    };
  }

  protected static createBaseMarkerTrackArgs(state: MarkerTrackState): MarkerTrackArgs {
    return {
      ...this.createBaseTrackArgs(state),
    };
  }

  protected static createBaseTimedItemsTrackArgs(state: TimedItemsTrackState): TimedItemsTrackArgs {
    return {
      ...this.createBaseTrackArgs(state),
      timedItemHooks: void 0 // not supported
    };
  }

  static createSource(state: SourceState): Source {
    switch (state.type) {
      case SourceType.URL:
        return UrlSource.fromState(state as UrlSourceState);
      case SourceType.TRACK:
        return TrackSource.fromState(state as TrackSourceState);
      default:
        throw new Error('niy');
    }
  }

  static createLoadStage(state: OpStageState): OpStage {
    return new OpStage({
      status: state.status,
      error: state.error,
    });
  }

  destroy() {}
}
