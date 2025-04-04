/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import {OmpBroadcastChannelActionsMap} from '../common/omp-broadcast-channel';
import {VideoControllerApi} from './video-controller-api';
import {UnwrapObservable} from '../types';
import {Observable} from 'rxjs';

type ExtractType<T, K extends keyof T> = T[K];
type ExtractReturnType<T, K extends keyof T> = T[K] extends (...args: any[]) => infer R ? R : never;
type ExtractParameterTypes<T, K extends keyof T> = T[K] extends (...args: infer A) => any ? A : never;

type ExtractPropertyTypes<T, K extends keyof T> = {
  requestType: UnwrapObservable<ExtractType<T, K>>;
  responseType: ExtractType<T, K>;
};

type ExtractMethodTypes<T, K extends keyof T> = {
  requestType: ExtractParameterTypes<T, K>;
  responseType: ExtractReturnType<T, K>;
};

export type HandshakeChannelActionsMap = OmpBroadcastChannelActionsMap<{
  'DetachedControllerProxy.connect': {
    requestType: {
      proxyId: string;
    };
    responseType: {
      proxyId: string;
      messageChannelId: string;
    };
  };
  'DetachedControllerProxy.connected': {
    requestType: {
      proxyId: string;
      messageChannelId: string;
    };
    responseType: {
      proxyId: string;
    };
  };
  'DetachedControllerProxy.heartbeat': {
    requestType: {
      proxyId: string;
      heartbeat: number;
    };
    responseType: {
      proxyId: string;
      heartbeat: number;
    };
  };
}>;

export type FlattenObservableToVoid<T> = T extends Observable<infer U> ? Observable<void> : T;

export type MessageChannelActionsMap = OmpBroadcastChannelActionsMap<{
  // property types
  'VideoControllerApi.onVideoLoading$': ExtractPropertyTypes<VideoControllerApi, 'onVideoLoading$'>;
  'VideoControllerApi.onVideoLoaded$': ExtractPropertyTypes<VideoControllerApi, 'onVideoLoaded$'>;
  'VideoControllerApi.onPlay$': ExtractPropertyTypes<VideoControllerApi, 'onPlay$'>;
  'VideoControllerApi.onPause$': ExtractPropertyTypes<VideoControllerApi, 'onPause$'>;
  'VideoControllerApi.onVideoTimeChange$': ExtractPropertyTypes<VideoControllerApi, 'onVideoTimeChange$'>;
  'VideoControllerApi.onSeeking$': ExtractPropertyTypes<VideoControllerApi, 'onSeeking$'>;
  'VideoControllerApi.onSeeked$': ExtractPropertyTypes<VideoControllerApi, 'onSeeked$'>;
  'VideoControllerApi.onBuffering$': ExtractPropertyTypes<VideoControllerApi, 'onBuffering$'>;
  'VideoControllerApi.onEnded$': ExtractPropertyTypes<VideoControllerApi, 'onEnded$'>;
  'VideoControllerApi.onAudioSwitched$': ExtractPropertyTypes<VideoControllerApi, 'onAudioSwitched$'>;
  'VideoControllerApi.onVideoWindowPlaybackStateChange$': ExtractPropertyTypes<VideoControllerApi, 'onVideoWindowPlaybackStateChange$'>;
  'VideoControllerApi.onVideoError$': ExtractPropertyTypes<VideoControllerApi, 'onVideoError$'>;
  'VideoControllerApi.onVolumeChange$': ExtractPropertyTypes<VideoControllerApi, 'onVolumeChange$'>;
  'VideoControllerApi.onFullscreenChange$': ExtractPropertyTypes<VideoControllerApi, 'onFullscreenChange$'>;
  'VideoControllerApi.onVideoSafeZoneChange$': ExtractPropertyTypes<VideoControllerApi, 'onVideoSafeZoneChange$'>;
  'VideoControllerApi.onPlaybackRateChange$': ExtractPropertyTypes<VideoControllerApi, 'onPlaybackRateChange$'>;
  'VideoControllerApi.onHelpMenuChange$': ExtractPropertyTypes<VideoControllerApi, 'onHelpMenuChange$'>;
  'VideoControllerApi.onPlaybackState$': ExtractPropertyTypes<VideoControllerApi, 'onPlaybackState$'>;
  'VideoControllerApi.onAudioLoaded$': ExtractPropertyTypes<VideoControllerApi, 'onAudioLoaded$'>;
  'VideoControllerApi.onSubtitlesLoaded$': ExtractPropertyTypes<VideoControllerApi, 'onSubtitlesLoaded$'>;
  'VideoControllerApi.onSubtitlesCreate$': ExtractPropertyTypes<VideoControllerApi, 'onSubtitlesCreate$'>;
  'VideoControllerApi.onSubtitlesHide$': ExtractPropertyTypes<VideoControllerApi, 'onSubtitlesHide$'>;
  'VideoControllerApi.onSubtitlesRemove$': ExtractPropertyTypes<VideoControllerApi, 'onSubtitlesRemove$'>;
  'VideoControllerApi.onSubtitlesShow$': ExtractPropertyTypes<VideoControllerApi, 'onSubtitlesShow$'>;

  // audio router
  'VideoControllerApi.onMainAudioChange$': ExtractPropertyTypes<VideoControllerApi, 'onMainAudioChange$'>;
  'VideoControllerApi.onMainAudioPeakProcessorMessage$': ExtractPropertyTypes<VideoControllerApi, 'onMainAudioPeakProcessorMessage$'>;

  // sidecar audio
  'VideoControllerApi.onSidecarAudioCreate$': ExtractPropertyTypes<VideoControllerApi, 'onSidecarAudioCreate$'>;
  'VideoControllerApi.onSidecarAudioRemove$': ExtractPropertyTypes<VideoControllerApi, 'onSidecarAudioRemove$'>;
  'VideoControllerApi.onSidecarAudioChange$': ExtractPropertyTypes<VideoControllerApi, 'onSidecarAudioChange$'>;
  'VideoControllerApi.onSidecarAudioPeakProcessorMessage$': ExtractPropertyTypes<VideoControllerApi, 'onSidecarAudioPeakProcessorMessage$'>;

  'VideoControllerApi.onThumbnailVttUrlChanged$': ExtractPropertyTypes<VideoControllerApi, 'onThumbnailVttUrlChanged$'>;
  'VideoControllerApi.onActiveNamedEventStreamsChange$': ExtractPropertyTypes<VideoControllerApi, 'onActiveNamedEventStreamsChange$'>;
  'VideoControllerApi.onNamedEvent$': ExtractPropertyTypes<VideoControllerApi, 'onNamedEvent$'>;

  // method types
  'VideoControllerApi.loadVideoInternal': ExtractMethodTypes<VideoControllerApi, 'loadVideoInternal'>;
  'VideoControllerApi.loadVideo': ExtractMethodTypes<VideoControllerApi, 'loadVideo'>;
  'VideoControllerApi.reloadVideo': ExtractMethodTypes<VideoControllerApi, 'reloadVideo'>;
  'VideoControllerApi.setVolume': ExtractMethodTypes<VideoControllerApi, 'setVolume'>;
  'VideoControllerApi.setPlaybackRate': ExtractMethodTypes<VideoControllerApi, 'setPlaybackRate'>;
  'VideoControllerApi.play': ExtractMethodTypes<VideoControllerApi, 'play'>;
  'VideoControllerApi.pause': ExtractMethodTypes<VideoControllerApi, 'pause'>;
  'VideoControllerApi.togglePlayPause': ExtractMethodTypes<VideoControllerApi, 'togglePlayPause'>;
  'VideoControllerApi.seekToFrame': ExtractMethodTypes<VideoControllerApi, 'seekToFrame'>;
  'VideoControllerApi.seekFromCurrentFrame': ExtractMethodTypes<VideoControllerApi, 'seekFromCurrentFrame'>;
  'VideoControllerApi.seekFromCurrentTime': ExtractMethodTypes<VideoControllerApi, 'seekFromCurrentTime'>;
  'VideoControllerApi.seekPreviousFrame': ExtractMethodTypes<VideoControllerApi, 'seekPreviousFrame'>;
  'VideoControllerApi.seekNextFrame': ExtractMethodTypes<VideoControllerApi, 'seekNextFrame'>;
  'VideoControllerApi.seekToTime': ExtractMethodTypes<VideoControllerApi, 'seekToTime'>;
  'VideoControllerApi.seekToTimecode': ExtractMethodTypes<VideoControllerApi, 'seekToTimecode'>;
  'VideoControllerApi.seekToPercent': ExtractMethodTypes<VideoControllerApi, 'seekToPercent'>;
  'VideoControllerApi.seekToEnd': ExtractMethodTypes<VideoControllerApi, 'seekToEnd'>;
  'VideoControllerApi.mute': ExtractMethodTypes<VideoControllerApi, 'mute'>;
  'VideoControllerApi.unmute': ExtractMethodTypes<VideoControllerApi, 'unmute'>;
  'VideoControllerApi.toggleMuteUnmute': ExtractMethodTypes<VideoControllerApi, 'toggleMuteUnmute'>;
  'VideoControllerApi.toggleFullscreen': ExtractMethodTypes<VideoControllerApi, 'toggleFullscreen'>;
  'VideoControllerApi.appendHelpMenuGroup': ExtractMethodTypes<VideoControllerApi, 'appendHelpMenuGroup'>;
  'VideoControllerApi.prependHelpMenuGroup': ExtractMethodTypes<VideoControllerApi, 'prependHelpMenuGroup'>;
  'VideoControllerApi.clearHelpMenuGroups': ExtractMethodTypes<VideoControllerApi, 'clearHelpMenuGroups'>;
  'VideoControllerApi.addSafeZone': ExtractMethodTypes<VideoControllerApi, 'addSafeZone'>;
  'VideoControllerApi.removeSafeZone': ExtractMethodTypes<VideoControllerApi, 'removeSafeZone'>;
  'VideoControllerApi.clearSafeZones': ExtractMethodTypes<VideoControllerApi, 'clearSafeZones'>;
  'VideoControllerApi.createSubtitlesVttTrack': ExtractMethodTypes<VideoControllerApi, 'createSubtitlesVttTrack'>;
  'VideoControllerApi.hideSubtitlesTrack': ExtractMethodTypes<VideoControllerApi, 'hideSubtitlesTrack'>;
  'VideoControllerApi.removeAllSubtitlesTracks': ExtractMethodTypes<VideoControllerApi, 'removeAllSubtitlesTracks'>;
  'VideoControllerApi.removeSubtitlesTrack': ExtractMethodTypes<VideoControllerApi, 'removeSubtitlesTrack'>;
  'VideoControllerApi.showSubtitlesTrack': ExtractMethodTypes<VideoControllerApi, 'showSubtitlesTrack'>;
  'VideoControllerApi.setActiveAudioTrack': ExtractMethodTypes<VideoControllerApi, 'setActiveAudioTrack'>;

  'VideoControllerApi.createMainAudioRouter': ExtractMethodTypes<VideoControllerApi, 'createMainAudioRouter'>;

  // 'VideoControllerApi.createMainAudioPeakProcessor': ExtractMethodTypes<VideoControllerApi, 'createMainAudioPeakProcessor'>;
  'VideoControllerApi.createMainAudioPeakProcessor': {
    requestType: ExtractParameterTypes<VideoControllerApi, 'createMainAudioPeakProcessor'>;
    responseType: FlattenObservableToVoid<ExtractReturnType<VideoControllerApi, 'createMainAudioPeakProcessor'>>;
  };

  'VideoControllerApi.routeMainAudioRouterNodes': ExtractMethodTypes<VideoControllerApi, 'routeMainAudioRouterNodes'>;

  'VideoControllerApi.createSidecarAudioTrack': ExtractMethodTypes<VideoControllerApi, 'createSidecarAudioTrack'>;
  'VideoControllerApi.createSidecarAudioTracks': ExtractMethodTypes<VideoControllerApi, 'createSidecarAudioTracks'>;
  'VideoControllerApi.removeSidecarAudioTracks': ExtractMethodTypes<VideoControllerApi, 'removeSidecarAudioTracks'>;
  'VideoControllerApi.activateSidecarAudioTracks': ExtractMethodTypes<VideoControllerApi, 'activateSidecarAudioTracks'>;
  'VideoControllerApi.deactivateSidecarAudioTracks': ExtractMethodTypes<VideoControllerApi, 'deactivateSidecarAudioTracks'>;
  'VideoControllerApi.removeAllSidecarAudioTracks': ExtractMethodTypes<VideoControllerApi, 'removeAllSidecarAudioTracks'>;
  'VideoControllerApi.createSidecarAudioRouter': ExtractMethodTypes<VideoControllerApi, 'createSidecarAudioRouter'>;
  'VideoControllerApi.routeSidecarAudioRouterNodes': ExtractMethodTypes<VideoControllerApi, 'routeSidecarAudioRouterNodes'>;

  // 'VideoControllerApi.createSidecarAudioPeakProcessor': ExtractMethodTypes<VideoControllerApi, 'createSidecarAudioPeakProcessor'>;
  'VideoControllerApi.createSidecarAudioPeakProcessor': {
    requestType: ExtractParameterTypes<VideoControllerApi, 'createSidecarAudioPeakProcessor'>;
    responseType: FlattenObservableToVoid<ExtractReturnType<VideoControllerApi, 'createSidecarAudioPeakProcessor'>>;
  };

  'VideoControllerApi.exportMainAudioTrackToSidecar': ExtractMethodTypes<VideoControllerApi, 'exportMainAudioTrackToSidecar'>;
  'VideoControllerApi.exportMainAudioTracksToSidecar': ExtractMethodTypes<VideoControllerApi, 'exportMainAudioTracksToSidecar'>;

  'VideoControllerApi.loadThumbnailVttUrl': ExtractMethodTypes<VideoControllerApi, 'loadThumbnailVttUrl'>;
  'VideoControllerApi.updateActiveNamedEventStreams': ExtractMethodTypes<VideoControllerApi, 'updateActiveNamedEventStreams'>;
  'VideoControllerApi.getActiveNamedEventStreams': ExtractMethodTypes<VideoControllerApi, 'getActiveNamedEventStreams'>;
  'VideoControllerApi.loadBlackVideo': ExtractMethodTypes<VideoControllerApi, 'loadBlackVideo'>;

  // sent from DetachedVideoController to RemoteVideoController
  'VideoControllerApi.attachVideoWindow': ExtractMethodTypes<VideoControllerApi, 'attachVideoWindow'>;
}>;
