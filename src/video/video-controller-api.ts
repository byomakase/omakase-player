import {Observable} from 'rxjs';
import {Video} from './video';
import {VideoApi} from '../api/video-api';
import {PlaybackState} from './playback-state';
import {Destroyable, OmakaseTextTrack, OmakaseTextTrackCue, VideoLoadingEvent} from '../types';
import {BufferedTimespan} from './video-controller';

export interface VideoControllerApi extends VideoApi, Destroyable {

  onHelpMenuChange$: Observable<void>;

  onPlaybackState$: Observable<PlaybackState>;

  onVideoLoading$: Observable<VideoLoadingEvent>;

  loadVideo(sourceUrl: string, frameRate: number, duration: number): Observable<Video>;

  getPlaybackState(): PlaybackState;

  getBufferedTimespans(): BufferedTimespan[];


  // DOM specific
  appendHTMLTrackElement(omakaseTextTrack: OmakaseTextTrack<OmakaseTextTrackCue>): Observable<HTMLTrackElement>;

  getTextTrackList(): TextTrackList | undefined;

  getTextTrackById(id: string): TextTrack | undefined;

  removeTextTrackById(id: string): boolean;

}
