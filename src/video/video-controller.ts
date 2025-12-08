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
import Decimal from 'decimal.js';
import {
  AudioLoadedEvent,
  AudioPeakProcessorMessageEvent,
  AudioSwitchedEvent,
  AudioUpdatedEvent,
  HelpMenuGroup,
  MainAudioChangeEvent,
  MainAudioInputSoloMuteEvent,
  OmpAudioTrack,
  OmpAudioTrackCreateType,
  OmpError,
  OmpNamedEvent,
  OmpNamedEventEventName,
  SidecarAudioChangeEvent,
  SidecarAudioCreateEvent,
  SidecarAudioInputSoloMuteEvent,
  SidecarAudioPeakProcessorMessageEvent,
  SidecarAudioRemoveEvent,
  SidecarAudiosChangeEvent,
  SidecarAudioVideoCurrentTimeBufferingEvent,
  SidecarAudioVolumeChangeEvent,
  SubtitlesCreateEvent,
  SubtitlesEvent,
  SubtitlesLoadedEvent,
  SubtitlesVttTrack,
  SyncTickEvent,
  ThumnbailVttUrlChangedEvent,
  VideoBufferingEvent,
  VideoDurationEvent,
  VideoEndedEvent,
  VideoErrorEvent,
  VideoFullscreenChangeEvent,
  VideoHelpMenuChangeEvent,
  VideoLoadedEvent,
  VideoLoadingEvent,
  VideoPlaybackRateEvent,
  VideoPlayEvent,
  VideoSafeZoneChangeEvent,
  VideoSeekedEvent,
  VideoSeekingEvent,
  VideoTimeChangeEvent,
  VideoWindowPlaybackStateChangeEvent,
  VolumeChangeEvent,
} from '../types';
import {
  BehaviorSubject,
  concatMap,
  delay,
  filter,
  forkJoin,
  from,
  fromEvent,
  interval,
  map,
  merge,
  Observable,
  of,
  ReplaySubject,
  Subject,
  switchMap,
  take,
  takeUntil,
  tap,
  timeout,
  toArray,
} from 'rxjs';
import {FrameRateUtil} from '../util/frame-rate-util';
import {
  completeSubject,
  completeSubjects,
  completeUnsubscribeSubjects,
  errorCompleteObserver,
  errorCompleteSubject,
  nextCompleteObserver,
  nextCompleteSubject,
  passiveObservable,
} from '../util/rxjs-util';
import {z} from 'zod';
import {TimecodeUtil} from '../util/timecode-util';
import Hls from 'hls.js';
import {Validators} from '../validators';
import {parseErrorMessage, zodErrorMapOverload} from '../util/error-util';
import {VideoControllerApi} from './video-controller-api';
import {destroyer, nullifier} from '../util/destroy-util';
import {
  AudioEffectBundle,
  AudioMeterStandard,
  BufferedTimespan,
  MediaElementPlaybackState,
  OmpAudioRouterState,
  OmpAudioRoutingConnection,
  OmpAudioRoutingInputType,
  OmpAudioRoutingPath,
  OmpMainAudioInputSoloMuteState,
  OmpMainAudioState,
  OmpSidecarAudioInputSoloMuteState,
  OmpSidecarAudioState,
  Video,
  VideoLoadOptions,
  VideoLoadOptionsInternal,
  VideoProtocol,
  VideoSafeZone,
  VideoWindowPlaybackState,
} from './model';
import {isNullOrUndefined} from '../util/object-util';
import {StringUtil} from '../util/string-util';
import {VideoDomControllerApi} from './video-dom-controller-api';
import {VideoLoader} from './video-loader';
import {OmpHlsConfig, VideoHlsLoader} from './video-hls-loader';
import {CryptoUtil} from '../util/crypto-util';
import {OmpAudioRouter} from './audio-router';
import {isNonNullable} from '../util/function-util';
import {OmpAudioPeakProcessor} from './audio-peak-processor';
import {BlobUtil} from '../util/blob-util';
import {UrlUtil} from '../util/url-util';
import {BrowserProvider} from '../common/browser-provider';
import {FileUtil} from '../util/file-util';
import {OmpAudioEffectFactory, OmpAudioEffectFilter, OmpAudioEffectParam, OmpAudioEffectsGraph, OmpAudioEffectsGraphDef, OmpAudioEffectsRegistry} from '../audio'; // @ts-ignore
import synchronizationProcessor from '../worker/omp-synchronization-processor.js?raw'; // @ts-ignore
import blackMp4Base64 from '../../assets/black.mp4.base64.txt?raw';
import {MediaElementPlayback} from './media-element-playback';
import {MediaElementUtil} from '../util/media-element-util';
import {VideoLoaderFactory} from './video-loader-factory';
import {HTMLVideoElementEvents, OmpAudioElement} from '../media-element/omp-media-element';

// @ts-ignore
import silentWavBase64 from '../../assets/silent.wav.base64.txt?raw';
import {SidecarAudioApi} from '../api/sidecar-audio-api';
import {SidecarAudioFactory} from './sidecar-audio-factory';
import {OmpAudioEffectsGraphConnection, OmpAudioEffectsSlot} from '../audio/model';

export interface VideoControllerConfig {
  frameDurationSpillOverCorrection: number;
  audioPlayMode: 'multiple' | 'single';
  hlsConfig: Partial<OmpHlsConfig>;
}

export const VIDEO_CONTROLLER_CONFIG_DEFAULT: VideoControllerConfig = {
  frameDurationSpillOverCorrection: 0.001,
  audioPlayMode: 'single',
  hlsConfig: {
    ...Hls.DefaultConfig,
    fetchManifestSubtitleTracks: true,
    subtitleDisplay: false,
  },
};

interface VideoFrameCallbackData {
  now: DOMHighResTimeStamp;
  metadata: VideoFrameCallbackMetadata;
}

export type SeekDirection = 'bw' | 'fw' | 'o';

interface SyncConditions {
  seekToFrame?: number;
  seekToTime?: number;
  currentTime?: number;
  videoFrameCallbackData?: VideoFrameCallbackData;
  seekDirection?: SeekDirection;
  newTimecode?: string;
}

export class VideoController implements VideoControllerApi {
  public static readonly videoVolumeDefault: number = 1;
  public static readonly videoPlaybackRateDefault: number = 1;
  public static readonly videoMutedDefault: boolean = false;

  public readonly onSyncTick$: Subject<SyncTickEvent> = new Subject<SyncTickEvent>();

  public readonly onVideoLoaded$: BehaviorSubject<VideoLoadedEvent | undefined> = new BehaviorSubject<VideoLoadedEvent | undefined>(void 0);
  public readonly onVideoLoading$: Subject<VideoLoadingEvent> = new Subject<VideoLoadingEvent>();

  public readonly onAudioLoaded$: BehaviorSubject<AudioLoadedEvent | undefined> = new BehaviorSubject<AudioLoadedEvent | undefined>(void 0);
  public readonly onAudioSwitched$: Subject<AudioSwitchedEvent> = new Subject<AudioSwitchedEvent>();
  public readonly onAudioUpdated$: Subject<AudioUpdatedEvent> = new Subject<AudioUpdatedEvent>();

  public readonly onSubtitlesLoaded$: BehaviorSubject<SubtitlesLoadedEvent | undefined> = new BehaviorSubject<SubtitlesLoadedEvent | undefined>(void 0);
  public readonly onSubtitlesCreate$: Subject<SubtitlesCreateEvent> = new Subject<SubtitlesCreateEvent>();
  public readonly onSubtitlesRemove$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();
  public readonly onSubtitlesShow$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();
  public readonly onSubtitlesHide$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();

  public readonly onPlay$: Subject<VideoPlayEvent> = new Subject<VideoPlayEvent>();
  public readonly onPause$: Subject<VideoPlayEvent> = new Subject<VideoPlayEvent>();
  public readonly onVideoTimeChange$: Subject<VideoTimeChangeEvent> = new Subject<VideoTimeChangeEvent>();
  public readonly onSeeking$: Subject<VideoSeekingEvent> = new Subject<VideoSeekingEvent>();
  public readonly onSeeked$: Subject<VideoSeekedEvent> = new Subject<VideoSeekedEvent>();
  public readonly onBuffering$: Subject<VideoBufferingEvent> = new Subject<VideoBufferingEvent>();
  public readonly onEnded$: Subject<VideoEndedEvent> = new Subject<VideoEndedEvent>();
  public readonly onVideoError$: Subject<VideoErrorEvent> = new Subject<VideoErrorEvent>();
  public readonly onVolumeChange$: Subject<VolumeChangeEvent> = new Subject<VolumeChangeEvent>();
  public readonly onFullscreenChange$: Subject<VideoFullscreenChangeEvent> = new Subject<VideoFullscreenChangeEvent>();
  public readonly onVideoSafeZoneChange$: Subject<VideoSafeZoneChangeEvent> = new Subject<VideoSafeZoneChangeEvent>();
  public readonly onVideoWindowPlaybackStateChange$: Subject<VideoWindowPlaybackStateChangeEvent> = new Subject<VideoWindowPlaybackStateChangeEvent>();

  public readonly onHelpMenuChange$: Subject<VideoHelpMenuChangeEvent> = new Subject<VideoHelpMenuChangeEvent>();
  public readonly onPlaybackState$: Subject<MediaElementPlaybackState> = new Subject<MediaElementPlaybackState>();
  public readonly onPlaybackRateChange$: Subject<VideoPlaybackRateEvent> = new Subject<VideoPlaybackRateEvent>();
  public readonly onDurationChange$: Subject<VideoDurationEvent> = new Subject<VideoDurationEvent>();

  public readonly onThumbnailVttUrlChanged$: Subject<ThumnbailVttUrlChangedEvent> = new Subject<ThumnbailVttUrlChangedEvent>();

  // audio router
  public readonly onMainAudioChange$: BehaviorSubject<MainAudioChangeEvent | undefined> = new BehaviorSubject<MainAudioChangeEvent | undefined>(void 0);
  public readonly onMainAudioPeakProcessorMessage$: Subject<AudioPeakProcessorMessageEvent> = new Subject<AudioPeakProcessorMessageEvent>();
  public readonly onMainAudioInputSoloMute$: BehaviorSubject<MainAudioInputSoloMuteEvent | undefined> = new BehaviorSubject<MainAudioInputSoloMuteEvent | undefined>(void 0);

  // sidecar audio
  public readonly onSidecarAudioCreate$: Subject<SidecarAudioCreateEvent> = new Subject<SidecarAudioCreateEvent>();
  public readonly onSidecarAudioLoaded$: Subject<SidecarAudioCreateEvent> = new Subject<SidecarAudioCreateEvent>();
  public readonly onSidecarAudioRemove$: Subject<SidecarAudioRemoveEvent> = new Subject<SidecarAudioRemoveEvent>();
  public readonly onSidecarAudioChange$: Subject<SidecarAudioChangeEvent> = new Subject<SidecarAudioChangeEvent>();
  public readonly onSidecarAudioVolumeChange$: Subject<SidecarAudioVolumeChangeEvent> = new Subject<SidecarAudioVolumeChangeEvent>();
  public readonly onSidecarAudioPeakProcessorMessage$: Subject<SidecarAudioPeakProcessorMessageEvent> = new Subject<SidecarAudioPeakProcessorMessageEvent>();
  public readonly onSidecarAudioInputSoloMute$: Subject<SidecarAudioInputSoloMuteEvent> = new Subject<SidecarAudioInputSoloMuteEvent>();
  public readonly onSidecarAudiosChange$: Subject<SidecarAudiosChangeEvent> = new Subject<SidecarAudiosChangeEvent>();

  public readonly onSidecarAudioVideoCurrentTimeBuffering$: Subject<SidecarAudioVideoCurrentTimeBufferingEvent> = new Subject<SidecarAudioVideoCurrentTimeBufferingEvent>();

  // audio output
  public readonly onAudioOutputVolumeChange$: Subject<VolumeChangeEvent> = new Subject<VolumeChangeEvent>();

  // VideoHlsLoader specific
  public readonly onActiveNamedEventStreamsChange$: Subject<OmpNamedEventEventName[]> = new Subject<OmpNamedEventEventName[]>();
  public readonly onNamedEvent$: Subject<OmpNamedEvent> = new Subject<OmpNamedEvent>();

  protected readonly _config: VideoControllerConfig;
  protected readonly _videoDomController: VideoDomControllerApi;
  /**
   * Stream of data provided by videoElement.requestVideoFrameCallback()
   * @protected
   */
  protected readonly _videoFrameCallback$: Subject<VideoFrameCallbackData | undefined> = new BehaviorSubject<VideoFrameCallbackData | undefined>(void 0);

  protected _videoLoader?: VideoLoader;
  protected _video?: Video;
  protected _videoLoadOptions?: VideoLoadOptions;
  protected _mediaElementPlayback?: MediaElementPlayback;
  protected _syncFrameNudgeTime: number = 0;
  protected _syncFineFrameTolerancePercent = 20;
  protected _syncLoopMaxIterations = 5;
  protected _videoFrameCallbackHandle?: number;

  protected _videoStalledCheckIntervalMs = 700;
  protected _videoStalledCheckLastCurrentTime?: number;
  protected _videoPausedSeekBufferingThresholdMs = 500;

  protected _activeNamedEventStreams: OmpNamedEventEventName[] = [];

  protected _subtitlesTracks: Map<string, SubtitlesVttTrack> = new Map<string, SubtitlesVttTrack>();
  protected _activeSubtitlesTrack?: SubtitlesVttTrack;

  protected _audioTracks: Map<string, OmpAudioTrack> = new Map<string, OmpAudioTrack>();

  /**
   * Created in constructor
   * @protected
   */
  protected _audioContext!: AudioContext;

  protected _audioOutputNode!: GainNode;
  protected _audioOutputMuted = VideoController.videoMutedDefault;
  protected _audioOutputVolume = VideoController.videoVolumeDefault;

  protected _mediaElementAudioSourceNode?: MediaElementAudioSourceNode;

  /**
   * Created in constructor
   * @protected
   */
  protected _mainAudioNode?: AudioNode;
  protected _mainAudioRouter?: OmpAudioRouter;
  protected _mainAudioPeakProcessor?: OmpAudioPeakProcessor;

  /**
   * Tracks main audio active state depending on {@link VideoControllerConfig.audioPlayMode}. If value is false, main audio is muted
   * @protected
   */
  protected _mainAudioActive = true;

  protected _sidecarAudios: Map<string, SidecarAudioApi> = new Map<string, SidecarAudioApi>();

  /**
   * Audio node where all sidecar audios merge
   * @protected
   */
  protected _sidecarAudiosOutputNode!: GainNode;

  /**
   * Contains sidecar audio id's for sidecar audios that are buffering video current time (and are not ready for playback)
   * @protected
   */
  protected _sidecarAudiosVideoCurrentTimeBuffering: Set<string> = new Set<string>();

  /**
   * Stores last video playback state {@link _mediaElementPlayback} before {@link _mediaElementPlayback.waitingSyncedMedia} changes to true
   * Used for restoring playback after {@link _mediaElementPlayback.waitingSyncedMedia} changes to false
   * @protected
   */
  protected _waitingSyncedMediaLastPlaybackState: MediaElementPlaybackState | undefined = void 0;

  /**
   * Time synchronization worklet
   * @protected
   */
  protected _syncWorklet?: AudioWorkletNode;
  protected _syncWorkletSource?: MediaElementAudioSourceNode;

  protected _blackMp4Url: string;

  protected _lastMainVolumeChangeEvent?: VolumeChangeEvent;
  /**
   * Volume tracking for Safari
   * @protected
   */
  protected _lastProvidedMainVolumeHlsLoaderSafari?: number;
  /**
   * Mute tracking for Safari
   * @protected
   */
  protected _lastProvidedMainMutedHlsLoaderSafari?: boolean;

  protected _thumbnailVttUrl?: string;
  protected _helpMenuGroups: HelpMenuGroup[] = [];

  /**
   * Source slot audio effects
   */

  protected _sourceSlot!: OmpAudioEffectsSlot;
  protected _sourceSlotEffectsGraph?: OmpAudioEffectsGraph;
  protected _isSourceSlotEffectAttaching = false;

  protected _destinationSlot!: OmpAudioEffectsSlot;
  protected _destinationSlotEffectsGraph?: OmpAudioEffectsGraph;
  protected _isDestinationSlotEffectAttaching = false;

  /**
   * Circut breaker for all loaded video events
   * @protected
   */
  protected _videoEventBreaker$ = new Subject<void>();

  /**
   * Cancels previous unfinished seek operation if ie. new seek is requested
   * @protected
   */
  protected _seekBreaker$ = new Subject<void>();

  /**
   * Cancels previous unfinished pause operation
   * @protected
   */
  protected _pausingBreaker$ = new Subject<void>();

  /**
   * Cancels monitoring for AudioContext.resume()
   * @protected
   */
  protected _audioContextResumeBreaker$ = new Subject<void>();

  protected _destroyed$ = new Subject<void>();

  constructor(config: Partial<VideoControllerConfig>, videoDomController: VideoDomControllerApi) {
    this._config = {
      ...VIDEO_CONTROLLER_CONFIG_DEFAULT,
      ...config,
      hlsConfig: {
        ...VIDEO_CONTROLLER_CONFIG_DEFAULT.hlsConfig,
        ...config.hlsConfig,
      },
    };
    this._videoDomController = videoDomController;

    this.createAudioContext();

    if (!this.isMainAudioCreationDelayed()) {
      this.createMainAudio();
      this._createEffectsSlots();
    }

    this._videoFrameCallback$.pipe(takeUntil(this._destroyed$)).subscribe((videoFrameCallbackData) => {
      if (videoFrameCallbackData) {
        if (!this._mediaElementPlayback!.seeking) {
          if (this.isPlaying()) {
            this.dispatchVideoTimeChange();
          } else if (this.isPaused()) {
            // nop
          }
        }
      }
    });

    this._blackMp4Url = UrlUtil.formatBase64Url('video/mp4', blackMp4Base64);

    this.createSyncWorklet();

    this.onAudioOutputVolumeChange$.pipe(takeUntil(this._destroyed$)).subscribe((audioOutputVolumeEvent) => {
      if (this.isVideoHlsLoaderInSafari()) {
        let newMainVolume = this.getVolume() * audioOutputVolumeEvent.volume;
        this._setVolume(newMainVolume);

        let newMainMuted = this._lastProvidedMainMutedHlsLoaderSafari ? true : audioOutputVolumeEvent.muted;
        this._setMuted(newMainMuted);
      }
    });

    this.onVolumeChange$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this._lastMainVolumeChangeEvent = event;
    });

    merge(this.onSidecarAudioCreate$, this.onSidecarAudioRemove$, this.onSidecarAudioChange$)
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (value) => {
          this.onSidecarAudiosChange$.next({
            sidecarAudioStates: this.getSidecarAudioStates(),
          });
        },
      });
  }

  private isVideoHlsLoaderInSafari = () => {
    return this._videoLoader instanceof VideoHlsLoader && BrowserProvider.instance().isSafari;
  };

  /**
   * For DRM'd videos Firefox doesn't allow tampering with audio source before setting up keys inside <video> element
   * That's why we are creating main audio after applying DRM keyes
   *
   * @protected
   */
  protected isMainAudioCreationDelayed(): boolean {
    return BrowserProvider.instance().isFirefox;
  }

  loadVideoInternal(sourceUrl: string, options: VideoLoadOptions | undefined, optionsInternal?: VideoLoadOptionsInternal): Observable<Video> {
    return passiveObservable<Video>((observer) => {
      let handleOnError = (err: any) => {
        this.onVideoError$.next({
          type: 'VIDEO_LOAD_ERROR',
          message: parseErrorMessage(err),
        });
        errorCompleteObserver(observer, err);
      };

      try {
        nextCompleteSubject(this._videoEventBreaker$);
        this._videoEventBreaker$ = new Subject<void>();

        this._videoLoadOptions = options;

        this.stopSynchronizationCallbacks();

        if (this.isVideoLoaded()) {
          this._videoDomController.getVideoElement().poster = '';

          // remove while video is still loaded
          this._removeAllSubtitlesTracks(false);

          this._video = void 0;
          this.onVideoLoaded$.next(void 0); // emit new value, BehaviourSubject

          this._audioTracks.clear();
          this.onAudioLoaded$.next(void 0); // emit new value, BehaviourSubject

          // subtitles
          this._subtitlesTracks = new Map<string, SubtitlesVttTrack>();
          this._activeSubtitlesTrack = void 0;
          this.onSubtitlesLoaded$.next(void 0); // emit new value, BehaviourSubject
        }

        if (StringUtil.isNonEmpty(options?.poster) && !this._videoDomController.isCompactAudioTheme()) {
          this._videoDomController.getVideoElement().poster = options!.poster!;
        }

        sourceUrl = Validators.url()(sourceUrl);

        const frameRate = FrameRateUtil.resolveFrameRate(FileUtil.isAudioFile(sourceUrl) ? FrameRateUtil.AUDIO_FRAME_RATE : options?.frameRate);

        if (options && !isNullOrUndefined(options.dropFrame)) {
          z.coerce.boolean().parse(options?.dropFrame, zodErrorMapOverload('Invalid dropFrame'));
        }
        let dropFrame = options && options.dropFrame !== void 0 ? options.dropFrame : frameRate ? FrameRateUtil.resolveDropFrameFromFramerate(frameRate) : false;

        if (frameRate && dropFrame && !FrameRateUtil.isSupportedDropFrameRate(frameRate)) {
          throw new Error(`Frame rate not supported: ${frameRate}, drop frame: ${dropFrame}`);
        }

        if (!isNullOrUndefined(options?.duration)) {
          z.coerce.number().min(0).parse(options?.duration, zodErrorMapOverload('Invalid duration'));
        }

        this.onVideoLoading$.next({
          sourceUrl: sourceUrl,
          frameRate: frameRate,
          options: options,
          isAttaching: optionsInternal && optionsInternal.videoWindowPlaybackState === 'attaching',
          isDetaching: optionsInternal && optionsInternal.videoWindowPlaybackState === 'detaching',
        });

        let videoLoader = this.resolveAndAttachVideoLoader(sourceUrl, options?.protocol);

        videoLoader
          .loadVideo(sourceUrl, options)
          .pipe(take(1))
          .subscribe({
            next: (video) => {
              if (this.isMainAudioCreationDelayed() && !this._mainAudioNode) {
                this.createMainAudio();
              }

              this._video = video;

              if (options && !StringUtil.isNullUndefinedOrWhitespace(options.ffom)) {
                let ffomTimecodeObject = TimecodeUtil.parseTimecodeToTimecodeObject(options.ffom!);
                if (ffomTimecodeObject.dropFrame !== dropFrame) {
                  throw new Error(`Incorrect FFOM format: ${options.ffom}, drop frame: ${dropFrame}`);
                }
                this._video.ffomTimecodeObject = ffomTimecodeObject;
              }

              this._syncFrameNudgeTime = Decimal.mul(this._video.frameDuration, 0.1).toNumber();

              this._mediaElementPlayback = new MediaElementPlayback();

              this.initEventHandlers();
              this.startTimeSynchronizationCallback();

              this.onVideoLoaded$.next({
                video: this._video,
                videoLoadOptions: this._videoLoadOptions,
                isAttaching: optionsInternal && optionsInternal.videoWindowPlaybackState === 'attaching',
                isDetaching: optionsInternal && optionsInternal.videoWindowPlaybackState === 'detaching',
              });

              if (!this._lastMainVolumeChangeEvent && this.getVideoElementVolume() !== VideoController.videoVolumeDefault) {
                // some browsers automatically set video element volume to last value set in previous sessions
                // we have to align that value with audioOutputVolume
                this.setVolume(VideoController.videoVolumeDefault);
              }

              nextCompleteObserver(observer, video);
            },
            error: (err) => {
              handleOnError(err);
            },
          });
      } catch (err) {
        handleOnError(err);
      }
    });
  }

  protected createSyncWorklet(): Observable<void> {
    return passiveObservable((observer) => {
      if (this._syncWorklet) {
        console.debug('syncWorklet already exists');
        nextCompleteObserver(observer);
      } else {
        let audioContext = this.getAudioContext();

        new Observable<AudioWorkletNode>((audioWorkletNode$) => {
          let ompAudioElement = new OmpAudioElement({loop: true});

          ompAudioElement.onLoaded$
            .pipe(
              filter((p) => !!p),
              take(1)
            )
            .pipe(takeUntil(this._destroyed$))
            .subscribe({
              next: (syncWorkletAudioElement) => {
                this._syncWorkletSource = audioContext.createMediaElementSource(ompAudioElement.mediaElement);
                const workletName = 'omp-synchronization-processor';
                try {
                  let audioWorkletNode = new AudioWorkletNode(this._syncWorkletSource.context, workletName, {
                    parameterData: {},
                  });
                  nextCompleteObserver(audioWorkletNode$, audioWorkletNode);
                } catch (e) {
                  let objectURL = BlobUtil.createObjectURL(BlobUtil.createBlob([synchronizationProcessor], {type: 'application/javascript'}));
                  this._syncWorkletSource.context.audioWorklet.addModule(objectURL).then(() => {
                    let audioWorkletNode = new AudioWorkletNode(this._syncWorkletSource!.context, workletName, {
                      parameterData: {},
                    });
                    nextCompleteObserver(audioWorkletNode$, audioWorkletNode);
                  });
                }
              },
            });

          ompAudioElement.loadSource(UrlUtil.formatBase64Url('audio/wav', silentWavBase64));
        }).subscribe((audioWorkletNode) => {
          this._syncWorklet = audioWorkletNode;

          this._syncWorklet.port.onmessage = (event: MessageEvent) => {
            this.onSyncTick$.next({});
          };

          this._syncWorkletSource!.connect(this._syncWorklet).connect(this._syncWorkletSource!.context.destination);

          let silentGainNode = audioContext.createGain();
          silentGainNode.gain.value = 0; // Set gain to 0 (silent)
          silentGainNode.connect(this._syncWorkletSource!.context.destination);

          this._syncWorkletSource!.connect(silentGainNode);
          nextCompleteObserver(observer);
        });
      }
    });
  }

  protected resolveAndAttachVideoLoader(sourceUrl: string, videoProtocol: VideoProtocol | undefined): VideoLoader {
    if (this._videoLoader) {
      this._videoLoader.destroy();
    }

    this._videoLoader = VideoLoaderFactory.createVideoLoader(this, sourceUrl, videoProtocol);

    // audio
    this._videoLoader.onAudioLoaded$
      .pipe(
        filter((p) => !!p),
        takeUntil(this._videoEventBreaker$)
      )
      .subscribe({
        next: (audioLoadedEvent) => {
          if (audioLoadedEvent!.audioTracks.length > 0) {
            this.setAudioTracks(audioLoadedEvent!.audioTracks).subscribe({
              next: (event) => {
                if (audioLoadedEvent!.activeAudioTrack) {
                  this.updateActiveAudioTrack(audioLoadedEvent!.activeAudioTrack.id);
                }
              },
            });
          }
        },
      });

    this._videoLoader.onAudioSwitched$.pipe(takeUntil(this._videoEventBreaker$)).subscribe({
      next: (event) => {
        this.updateActiveAudioTrack(event!.activeAudioTrack.id);
      },
    });

    // subtitles
    this._videoLoader.onSubtitlesLoaded$
      .pipe(
        filter((p) => !!p),
        takeUntil(this._videoEventBreaker$)
      )
      .subscribe({
        next: (event) => {
          this.setSubtitlesTracks(event!.tracks);
        },
      });

    // events
    this._videoLoader.onNamedEvent$.pipe(takeUntil(this._videoEventBreaker$)).subscribe({
      next: (event) => {
        this.onNamedEvent$.next(event);
      },
    });

    return this._videoLoader;
  }

  loadVideo(sourceUrl: string, options?: VideoLoadOptions): Observable<Video> {
    return this.loadVideoInternal(sourceUrl, options);
  }

  reloadVideo(): Observable<Video> {
    this.validateVideoLoaded();

    return this.loadVideo(this._video!.sourceUrl, this._videoLoadOptions);
  }

  get videoElement(): HTMLVideoElement {
    return this._videoDomController.getVideoElement();
  }

  protected createVideoPlayEvent(): VideoPlayEvent {
    let currentTime = this.getCurrentTime();
    return {
      currentTime: currentTime,
      currentTimecode: this.formatToTimecode(currentTime),
    };
  }

  protected createAudioElement(options?: {loop?: boolean}): Observable<HTMLAudioElement> {
    let audioElement = new Audio();

    // don't display any of the <audio> elements
    // audioElement.style.display = 'none'; // TODO remove

    // don't allow controls (not visible anyway)
    // audioElement.controls = false;
    audioElement.controls = true; // TODO remove

    audioElement.id = CryptoUtil.uuid();

    audioElement.loop = options ? !!options.loop : false;

    return new Observable<HTMLAudioElement>((observer) => {
      nextCompleteObserver(observer, audioElement);
    });
  }

  protected initEventHandlers() {
    let latestSeekStartTime: number | undefined;

    fromEvent(this.videoElement, HTMLVideoElementEvents.PLAYING)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe({
        next: () => {
          this.onPlay$.next(this.createVideoPlayEvent());
        },
      });

    fromEvent(this.videoElement, HTMLVideoElementEvents.PAUSE)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe({
        next: () => {
          let finalizePause = () => {
            this.dispatchVideoTimeChange();
            this.onPause$.next(this.createVideoPlayEvent());

            if (this.getCurrentTime() >= this.getMostAccurateDuration()) {
              this.onEnded$.next({});
            }
          };

          if (this.getCurrentTime() >= this.getMostAccurateDuration()) {
            finalizePause();
          } else {
            // console.debug(`%cpause control sync start`, 'color: purple');
            this.syncVideoFrames({}).subscribe((result) => {
              // playbackState.pausing can be either true (pause through API) or even false (pause initiated externally by browser with PIP close)
              // Thus, we will not inspect this._playbackStateMachine!.pausing
              this._seekFromCurrentFrame(1)
                .pipe(takeUntil(this._pausingBreaker$), takeUntil(this._seekBreaker$), take(1))
                .subscribe({
                  next: () => {
                    // console.debug(`%cpause control sync end`, 'color: purple');
                    finalizePause();
                  },
                });
            });
          }
        },
      });

    fromEvent(this.videoElement, HTMLVideoElementEvents.WAITING)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe((event) => {
        this._mediaElementPlayback!.waiting = true;
      });

    fromEvent(this.videoElement, HTMLVideoElementEvents.PROGRESS)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe((event) => {
        this.onBuffering$.next({
          bufferedTimespans: this.getBufferedTimespans(),
        });
      });

    fromEvent(this.videoElement, HTMLVideoElementEvents.ENDED)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe((event) => {
        this.onEnded$.next({});
      });

    fromEvent(this.videoElement, HTMLVideoElementEvents.VOLUMECHANGE)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe((event) => {
        this.dispatchOnVolumeChange();
      });

    fromEvent(this.videoElement, HTMLVideoElementEvents.RATECHANGE)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe((event) => {
        this.onPlaybackRateChange$.next({
          playbackRate: this.getPlaybackRate(),
        });
      });

    fromEvent(this.videoElement, HTMLVideoElementEvents.DURATIONCHANGE)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe((event) => {
        this.onDurationChange$.next({
          duration: this.getDuration(),
        });
      });

    this._videoDomController.onFullscreenChange$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this.onFullscreenChange$.next(event);
    });

    this._videoDomController.onVideoSafeZoneChange$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this.onVideoSafeZoneChange$.next(event);
    });

    this._mediaElementPlayback!.onChange$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this.onPlaybackState$.next(event);
    });

    this.onPlay$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._mediaElementPlayback!.setPlaying();
      this._videoStalledCheckLastCurrentTime = void 0;
    });

    this.onPause$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._videoStalledCheckLastCurrentTime = void 0;
      this._mediaElementPlayback!.setPaused();
    });

    this.onSeeking$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._mediaElementPlayback!.seeking = true;
      latestSeekStartTime = performance.now();
    });

    this.onSeeked$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._mediaElementPlayback!.seeking = false;
      this._mediaElementPlayback!.waiting = false;
      latestSeekStartTime = void 0;
    });

    this.onDurationChange$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._video!.correctedDuration = this.getHTMLVideoElement().duration;
    });

    this.onEnded$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._mediaElementPlayback!.setEnded();
      this._videoStalledCheckLastCurrentTime = void 0;
    });

    this.onVideoTimeChange$.pipe(takeUntil(this._videoEventBreaker$)).subscribe({
      next: () => {
        // pauses video if waitingSyncedMedia is set and video is playing
        if (this._mediaElementPlayback && this._mediaElementPlayback.waitingSyncedMedia && this.isPlaying()) {
          this._pause();
        }
      },
    });

    this.onSidecarAudioVideoCurrentTimeBuffering$.pipe(takeUntil(this._videoEventBreaker$)).subscribe({
      next: (event) => {
        if (event.buffering) {
          this._sidecarAudiosVideoCurrentTimeBuffering.add(event.sidecarAudioState.audioTrack.id);
        } else {
          this._sidecarAudiosVideoCurrentTimeBuffering.delete(event.sidecarAudioState.audioTrack.id);
        }

        if (this._mediaElementPlayback) {
          let setWaitingSyncedMedia = !this._mediaElementPlayback.waitingSyncedMedia && this._sidecarAudiosVideoCurrentTimeBuffering.size > 0;
          let unsetWaitingSyncedMedia = this._mediaElementPlayback.waitingSyncedMedia && this._sidecarAudiosVideoCurrentTimeBuffering.size === 0;

          if (setWaitingSyncedMedia) {
            this._mediaElementPlayback.waitingSyncedMedia = true;
            this._waitingSyncedMediaLastPlaybackState = this.getPlaybackState();
          } else if (unsetWaitingSyncedMedia) {
            this._mediaElementPlayback!.waitingSyncedMedia = false;
            if (this._waitingSyncedMediaLastPlaybackState) {
              if (this._waitingSyncedMediaLastPlaybackState.playing && !this.isPlaying()) {
                this.play();
              }
            }
          }
          // console.debug(`Waiting synced media: ${this._mediaElementPlayback.waitingSyncedMedia} ${this._mediaElementPlayback.waitingSyncedMedia ? Array.from(this._sidecarAudiosVideoCurrentTimeBuffering) : ''}`)
        }
      },
    });

    this._videoEventBreaker$.subscribe({
      next: (event) => {
        this.removeAllSidecarAudioTracks();
      },
    });

    interval(this._videoStalledCheckIntervalMs)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe((value) => {
        let currentTime = this.getCurrentTime();

        if (!this._videoStalledCheckLastCurrentTime) {
          this._videoStalledCheckLastCurrentTime = currentTime;
          return;
        }

        if (this._mediaElementPlayback && this._mediaElementPlayback.state.playing) {
          let timeOffset = ((this._videoStalledCheckIntervalMs * 0.8) / 1000) * this.getPlaybackRate(); // in seconds
          let comparisonTime = this._videoStalledCheckLastCurrentTime + timeOffset;

          let isWaiting = currentTime < comparisonTime;
          this._mediaElementPlayback.waiting = isWaiting;

          this._videoStalledCheckLastCurrentTime = currentTime;
        }

        if (this._mediaElementPlayback && !this._mediaElementPlayback.state.playing && !isNullOrUndefined(latestSeekStartTime)) {
          let isWaiting = !!latestSeekStartTime && performance.now() - latestSeekStartTime > this._videoPausedSeekBufferingThresholdMs;
          if (isWaiting) {
            // set waiting only if seek operation is taking too long, onSeeked event will eventually reset waiting state
            this._mediaElementPlayback.waiting = true;
          }
        }
      });
  }

  getBufferedTimespans(): BufferedTimespan[] {
    return MediaElementUtil.getBufferedTimespans(this.videoElement);
  }

  protected startTimeSynchronizationCallback() {
    let isSW = this._video && (this._video.audioOnly || this._video.drm);
    let isRVFC = this.videoElement && 'requestVideoFrameCallback' in this.videoElement;

    if (isSW) {
      this.startSWSynchronization();
    } else if (isRVFC) {
      this.startRVFCSynchronization();
    } else {
      throw new OmpError('Could not detect time synchronization method');
    }
  }

  protected stopSynchronizationCallbacks() {
    this.stopSWSynchronization();
    this.stopRVFCSynchronization();
  }

  protected startSWSynchronization() {
    // console.debug('startSWSynchronization');
    this.onSyncTick$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe({
      next: (event) => {
        if (!this._mediaElementPlayback!.seeking) {
          if (this.isPlaying()) {
            this.dispatchVideoTimeChange();
          } else if (this.isPaused()) {
            // nop
          }
        }
      },
    });
  }

  protected stopSWSynchronization() {
    // nop for now
  }

  protected startRVFCSynchronization() {
    // console.debug('startRVFCSynchronization');
    let nextVideoFrameCallback = () => {
      if (this.videoElement) {
        this._videoFrameCallbackHandle = this.videoElement.requestVideoFrameCallback((now, metadata) => {
          onVideoFrameCallback({
            now: now,
            metadata: metadata,
          });
        });
      } else {
        console.debug('Cannot call requestVideoFrameCallback, videoElement not found');
      }
    };

    let onVideoFrameCallback = (videoFrameCallbackData: VideoFrameCallbackData) => {
      this._videoFrameCallback$.next(videoFrameCallbackData);
      nextVideoFrameCallback();
    };

    nextVideoFrameCallback();

    this._videoFrameCallback$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe((videoFrameCallbackData) => {
      if (videoFrameCallbackData) {
        if (!this._mediaElementPlayback!.seeking) {
          if (this.isPlaying()) {
            this.dispatchVideoTimeChange();
          } else if (this.isPaused()) {
            // nop
          }
        }
      }
    });
  }

  protected stopRVFCSynchronization() {
    if (this.videoElement && this._videoFrameCallbackHandle) {
      this.videoElement.cancelVideoFrameCallback(this._videoFrameCallbackHandle);
    }
  }

  private syncVideoFrames(syncConditions: SyncConditions): Observable<boolean> {
    // console.debug('syncFrames - START', syncConditions);
    return new Observable<boolean>((o$) => {
      let syncBreaker$ = new BehaviorSubject<boolean>(false);
      let syncLoopVideoCallbackBreaker$ = new Subject<void>();
      let syncLoopIterationsLeft = this._syncLoopMaxIterations;

      this._seekBreaker$.pipe(takeUntil(syncLoopVideoCallbackBreaker$)).subscribe(() => {
        // console.debug(`%csyncFrames - seek breaker triggered`, 'color: gray');
        syncBreaker$.next(true);
        completeSync();
      });

      let completeSync = () => {
        nextCompleteSubject(syncLoopVideoCallbackBreaker$);
        o$.next(true);
        o$.complete();
        // console.debug(`%csyncFrames - END`, 'color: gray');
      };

      let seek = (time: number) => {
        syncBreaker$.pipe(take(1)).subscribe((syncBreak) => {
          if (syncBreak) {
            // console.debug(`%csyncFrames - seek skipped, breaker already triggered`, 'color: gray');
          } else {
            this._seekTimeFireAndForget(time);
          }
        });
      };

      /**
       * For now we want to check frame time tolerance only for fractional non-drop frame rates
       */
      let shouldCheckFrameTimeTolerance = () => {
        return !this.getVideo()!.dropFrame && FrameRateUtil.isFrameRateFractional(this.getVideo()!.frameRate);
      };

      /**
       * Negative percentage indicates currentTime is behind actual video time
       */
      let currentFrameTimeToleranceCheck = () => {
        let currentTime = this.getCurrentTime();
        let currentTimeFrame = this.calculateTimeToFrame(currentTime);
        let currentTimeIdealVsRealDiff = this.calculateFrameToTime(currentTimeFrame) - currentTime;
        let frameDiffPercentage = Decimal.mul(currentTimeIdealVsRealDiff, 100).div(this.getVideo()!.frameDuration).toNumber();
        return frameDiffPercentage;
      };

      if (this.isPlaying()) {
        // console.debug(`%csyncFrames - SKIPPED: video is playing`, 'color: gray');
        completeSync();
      } else if (this.getCurrentTime() >= this.getMostAccurateDuration()) {
        // console.debug(`%csyncFrames - SKIPPED: video exceeded duration`, 'color: magenta');
        completeSync();
      } else {
        let checkIfDone = (videoFrameCallbackData?: VideoFrameCallbackData) => {
          let currentTime = this.getCurrentTime();
          let currentTimeFrame = this.calculateTimeToFrame(currentTime);
          let mediaTime = videoFrameCallbackData ? videoFrameCallbackData.metadata.mediaTime : void 0;
          let mediaTimeFrame = mediaTime ? this.calculateTimeToFrame(mediaTime) : void 0;

          // console.debug(`syncFrames.checkIfDone`, {
          //   currentTime: currentTime,
          //   currentTimeFrame: currentTimeFrame,
          //   currentTimeTimecode: TimecodeUtil.formatToTimecode(currentTime, this._frameRateDecimal!, this._video!.dropFrame),
          //   mediaTime: mediaTime,
          //   mediaTimeFrame: mediaTimeFrame,
          //   videoFrameCallbackData: videoFrameCallbackData
          // });

          if (this.isPlaying()) {
            // console.debug(`%csyncFrames - UNKNOWN: video is playing`, 'color: gray');
            return true;
          }

          if (currentTimeFrame === 0) {
            // console.debug(`%csyncFrames - OK: currentTimeFrame[${currentTimeFrame}] === 0`, 'color: green');
            return true;
          }

          if (syncConditions.seekToFrame) {
            if (syncConditions.seekToFrame === currentTimeFrame) {
              if (currentTimeFrame === mediaTimeFrame || !mediaTimeFrame) {
                // console.debug(`%csyncFrames - OK: ((currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]) || !mediaTimeFrame[${mediaTimeFrame}])`, 'color: green');
                return true;
              }
            }
          } else {
            if (currentTimeFrame === mediaTimeFrame || !mediaTimeFrame) {
              // console.debug(`%csyncFrames - OK: currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]`, 'color: green', {
              //   currentTime: currentTime,
              //   mediaTime: mediaTime,
              // });

              if (shouldCheckFrameTimeTolerance()) {
                let frameTolerance = currentFrameTimeToleranceCheck();
                // if frameTolerance exceeds allowed value we're not done yet
                return Math.abs(frameTolerance) <= this._syncFineFrameTolerancePercent;
              }

              return true;
            }
          }

          return false;
        };

        let seekToFrameTimeBaseline: number;

        let syncLoop = (videoFrameCallbackData?: VideoFrameCallbackData) => {
          let syncLoopIteration = this._syncLoopMaxIterations - syncLoopIterationsLeft;
          // console.debug(`syncFrames.syncLoop - START (${syncLoopIteration})`, {
          //   syncConditions: syncConditions,
          //   videoFrameCallbackData: videoFrameCallbackData,
          //   dropped: this.videoElement.getVideoPlaybackQuality(),
          // });

          if (this.isPlaying()) {
            completeSync();
            return;
          }

          if (checkIfDone(videoFrameCallbackData)) {
            completeSync();
            return;
          }

          let currentTime = this.getCurrentTime();
          let currentTimeFrame = this.calculateTimeToFrame(currentTime);
          let mediaTime = videoFrameCallbackData ? videoFrameCallbackData.metadata.mediaTime : void 0;
          let mediaTimeFrame = mediaTime ? this.calculateTimeToFrame(mediaTime) : void 0;

          if (syncLoopIterationsLeft-- <= 0) {
            // console.debug(
            //   `%csyncFrames - TOO MANY SYNCs, EXITING.. : currentTime[${currentTime}], mediaTime[${mediaTime}], currentTimeFrame[${currentTimeFrame}], mediaTimeFrame[${mediaTimeFrame}]`,
            //   'color: red'
            // );
            completeSync();
            return;
          }

          // console.debug(
          //   `syncFrames - currentTime[${currentTime}|${this.formatToTimecode(currentTime)}], mediaTime[${mediaTime}|${mediaTime ? this.formatToTimecode(mediaTime) : void 0}], currentTimeFrame[${currentTimeFrame}], mediaTimeFrame[${mediaTimeFrame}], `
          // );

          if (syncConditions.seekToFrame) {
            if (!seekToFrameTimeBaseline) {
              seekToFrameTimeBaseline = currentTime;
            }

            if (syncConditions.seekToFrame === currentTimeFrame) {
              if (currentTimeFrame === mediaTimeFrame || !mediaTimeFrame) {
                // console.debug(`%csyncFrames - OK: ((currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]) || !mediaTimeFrame[${mediaTimeFrame}])`, 'color: green');
                completeSync();
              } else {
                // console.debug(
                //   `%csyncFrames - CORRECTION SEEK TO FRAME; currentTimeFrame[${currentTimeFrame}] ${currentTimeFrame > mediaTimeFrame ? '>' : '<'} mediaTimeFrame[${mediaTimeFrame}]`,
                //   'color: red'
                // );

                let frameDiff = Math.abs(currentTimeFrame - mediaTimeFrame);
                // console.debug(`%csyncFrames - frameDiff: ${frameDiff}`, 'color: orange');

                // in first sync iteration seek without nudging (frameCorrectionTime = 0)
                let frameCorrectionTime = syncLoopIteration === 0 ? 0 : this._syncFrameNudgeTime * (currentTimeFrame > mediaTimeFrame ? 1 : -1);

                seek(Decimal.add(currentTime, frameCorrectionTime).toNumber());
              }
            } else {
              console.debug(
                // `%csyncFrames - CORRECTION SEEK TO FRAME; syncConditions.seekToFrame[${syncConditions.seekToFrame}] !== currentTimeFrame[${currentTimeFrame}] | seekToFrameTimeBaseline=${seekToFrameTimeBaseline}`,
                'color: red'
              );

              let frameDiff = Math.abs(syncConditions.seekToFrame - currentTimeFrame);
              let frameCorrectionTime = frameDiff * this._video!.frameDuration;

              let seekToDecimal =
                syncConditions.seekToFrame >= currentTimeFrame ? Decimal.add(seekToFrameTimeBaseline, frameCorrectionTime) : Decimal.sub(seekToFrameTimeBaseline, frameCorrectionTime);
              let seekTo = seekToDecimal.toNumber();

              seekToFrameTimeBaseline = seekTo;

              // console.debug(`%csyncFrames - frameDiff: ${frameDiff}`, 'color: orange');
              // console.debug(`%csyncFrames - frameCorrectionTime: ${frameCorrectionTime}`, 'color: orange');
              // console.debug(`%csyncFrames - seekTo: ${seekTo}`, 'color: orange');

              seek(seekTo);
            }
          } else {
            if (currentTimeFrame === mediaTimeFrame || !mediaTimeFrame) {
              // console.debug(`%csyncFrames - OK: currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]`, 'color: green');

              if (shouldCheckFrameTimeTolerance()) {
                let currentFrameTimeTolerance = currentFrameTimeToleranceCheck();
                // only seek if we have to seek forward, we don't want to seek backwards
                if (currentFrameTimeTolerance < 0 && Math.abs(currentFrameTimeTolerance) > this._syncFineFrameTolerancePercent) {
                  // console.debug(`%c syncFrames - FINE FRAME TUNING`, 'color: blue');
                  // currentTime returned by video element lags behind actual currentTime, shake it up a bit
                  seek(currentTime);
                } else {
                  completeSync();
                }
              } else {
                completeSync();
              }
            } else {
              // console.debug(`%csyncFrames - CORRECTION; currentTimeFrame[${currentTimeFrame}] ${currentTimeFrame > mediaTimeFrame ? '>' : '<'} mediaTimeFrame[${mediaTimeFrame}]`, 'color: red');
              if (syncLoopIteration === 0) {
                // first sync loop iteration, give video element some more time to update mediaTime, thus repeat initial seek
                seek(currentTime);
              } else {
                if (currentTimeFrame > mediaTimeFrame) {
                  seek(Decimal.add(currentTime, this._syncFrameNudgeTime).toNumber());
                } else if (mediaTime) {
                  seek(mediaTime + this._syncFrameNudgeTime);
                }
              }
            }
          }

          // console.debug('syncFrames.syncLoop - END');

          completeSync();
        };
        this._videoFrameCallback$.pipe(delay(syncConditions.seekToFrame ? 0 : 0), takeUntil(syncLoopVideoCallbackBreaker$)).subscribe({
          next: (videoFrameCallbackData) => {
            // console.debug('syncFrames.syncLoop - videoFrameCallback$ trigger', videoFrameCallbackData);
            syncLoop(videoFrameCallbackData);
          },
        });
      }
    });
  }

  private constrainSeekTime(time: number): number {
    let duration = this.getMostAccurateDuration();
    return time < 0 ? 0 : time > duration ? duration : time;
  }

  private constrainSeekFrame(frame: number): number {
    return frame < 0 ? 0 : frame > this.getTotalFrames() ? this.getTotalFrames() : frame;
  }

  private seekTimeAndSync(newTime: number, syncConditions: SyncConditions = {}): Observable<boolean> {
    let timeBeforeSeek = this.getCurrentTime();
    return new Observable<boolean>((o$) => {
      // if we already have seek in progress, break previous seek operation
      if (this._mediaElementPlayback!.seeking) {
        nextCompleteSubject(this._seekBreaker$);
        this._mediaElementPlayback!.seeking = false;
        this._seekBreaker$ = new Subject<void>();
      }

      if (!isNaN(newTime)) {
        newTime = this.constrainSeekTime(newTime);
        let videoDuration = this.getMostAccurateDuration();

        if (newTime <= 0) {
          this.seekTimeWithoutSync(0).subscribe(() => {
            nextCompleteObserver(o$, true);
          });
        } else if (newTime === videoDuration) {
          this._seekToEnd().subscribe(() => {
            nextCompleteObserver(o$, true);
          });
        } else {
          fromEvent(this.videoElement, HTMLVideoElementEvents.SEEKING)
            .pipe(takeUntil(this._seekBreaker$), take(1))
            .subscribe((event) => {
              this.onSeeking$.next({
                toTime: newTime,
                toTimecode: this.formatToTimecode(newTime),
                fromTime: timeBeforeSeek,
                fromTimecode: this.formatToTimecode(timeBeforeSeek),
              });
            });

          fromEvent(this.videoElement, HTMLVideoElementEvents.SEEKED)
            .pipe(takeUntil(this._seekBreaker$), take(1))
            .subscribe((event) => {
              let finalizeSeek = () => {
                this.onSeeked$.next({
                  currentTime: this.getCurrentTime(),
                  currentTimecode: this.getCurrentTimecode(),
                  previousTime: timeBeforeSeek,
                  previousTimecode: this.formatToTimecode(timeBeforeSeek),
                });
                this._mediaElementPlayback!.seeking = false;
              };

              let finishSeek = () => {
                this.dispatchVideoTimeChange();
                nextCompleteObserver(o$, true);
              };

              if (this.getCurrentTime() >= this.getMostAccurateDuration()) {
                if (this.isPaused()) {
                  finalizeSeek();
                  this._seekToEnd().subscribe((event) => {
                    finishSeek();
                  });
                } else {
                  // video is playing, no need to sync frames if video is near the end, it will be done in onPause finalization when video finally ends
                }
              } else {
                this.syncVideoFrames(syncConditions).subscribe((result) => {
                  finalizeSeek();
                  finishSeek();
                });
              }
            });

          // console.debug(`Seeking to timestamp (sync ON): ${newTime} \t ${this.formatToTimecode(newTime)}`);
          this.setCurrentTime(newTime);
        }
      }
    });
  }

  private seekTimeWithoutSync(newTime: number, dispatchSeeking: boolean = true, dispatchSeeked: boolean = true): Observable<boolean> {
    let timeBeforeSeek = this.getCurrentTime();
    return new Observable<boolean>((o$) => {
      // do we have seek already in progress
      if (this._mediaElementPlayback!.seeking) {
        nextCompleteSubject(this._seekBreaker$);
        this._mediaElementPlayback!.seeking = false;
        this._seekBreaker$ = new Subject<void>();
      }

      if (!isNaN(newTime)) {
        newTime = this.constrainSeekTime(newTime);

        fromEvent(this.videoElement, HTMLVideoElementEvents.SEEKING)
          .pipe(takeUntil(this._seekBreaker$), take(1))
          .subscribe((event) => {
            if (dispatchSeeking) {
              this.onSeeking$.next({
                toTime: newTime,
                toTimecode: this.formatToTimecode(newTime),
                fromTime: timeBeforeSeek,
                fromTimecode: this.formatToTimecode(timeBeforeSeek),
              });
            }
          });

        fromEvent(this.videoElement, HTMLVideoElementEvents.SEEKED)
          .pipe(takeUntil(this._seekBreaker$), take(1))
          .subscribe((event) => {
            if (dispatchSeeked) {
              this.onSeeked$.next({
                currentTime: this.getCurrentTime(),
                currentTimecode: this.getCurrentTimecode(),
                previousTime: timeBeforeSeek,
                previousTimecode: this.formatToTimecode(timeBeforeSeek),
              });
            }

            this._mediaElementPlayback!.seeking = false;

            nextCompleteObserver(o$, true);

            this.dispatchVideoTimeChange();
          });

        // console.debug(`Seeking to timestamp (sync OFF): ${newTime} \t ${this.formatToTimecode(newTime)}`);

        this.setCurrentTime(newTime);
      }
    });
  }

  private _seekTimeFireAndForget(newTime: number) {
    if (!isNaN(newTime)) {
      let currentTime = this.getCurrentTime();
      newTime = this.constrainSeekTime(newTime);
      let seekDirection: SeekDirection = newTime === currentTime ? 'o' : newTime > currentTime ? 'fw' : 'bw';
      let diffDecimal = Decimal.sub(currentTime, newTime).abs();
      // console.debug(`Seeking from currentTime[${currentTime}] to newTime[${newTime}], direction: ${seekDirection} ${diffDecimal.toNumber()}`);
      this.setCurrentTime(newTime);
    }
  }

  /**
   *
   * @param timeOffset Time offset in seconds
   * @param syncConditions
   */
  private seekFromCurrentTimeAndSync(timeOffset: number, syncConditions: SyncConditions = {}): Observable<boolean> {
    let currentTime = this.getCurrentTime();

    //Sync to frame start
    if (syncConditions.currentTime) {
      currentTime = syncConditions.currentTime;
    }
    let newTime = Decimal.add(currentTime, timeOffset).toNumber();

    let seekDirection: SeekDirection;

    if (syncConditions.seekDirection) {
      seekDirection = syncConditions.seekDirection;
    } else {
      seekDirection = newTime === currentTime ? 'o' : newTime > currentTime ? 'fw' : 'bw';
    }

    let diff = Decimal.sub(currentTime, newTime).abs().toNumber();
    // console.debug(`Seeking from currentTime ${currentTime} to ${newTime}, direction: ${seekDirection} ${diff}`);

    return this.seekTimeAndSync(newTime, syncConditions);
  }

  private setCurrentTime(time: number) {
    this.videoElement.currentTime = time;
  }

  private getMostAccurateDuration() {
    this.validateVideoLoaded();
    return isNullOrUndefined(this._video!.correctedDuration) ? this.getDuration() : this._video!.correctedDuration!;
  }

  private _seekToFrame(frame: number): Observable<boolean> {
    if (!this.isPlaying() && !isNaN(frame)) {
      console.debug(`Seeking to frame: ${frame}`);
      if (frame <= 0) {
        return this.seekTimeAndSync(0, {});
      } else {
        let videoDuration = this.getMostAccurateDuration();
        let frameStartTime = this.calculateFrameToTime(frame);
        let frameStartTimeWithSpillOver = Decimal.add(frameStartTime, this._config.frameDurationSpillOverCorrection).toNumber();
        let frameTimeToSeek = frameStartTimeWithSpillOver;

        // check last frame edge cases
        if (frameStartTimeWithSpillOver > videoDuration) {
          console.debug(`Frame time start with spillover [${frameStartTimeWithSpillOver}] exceeds video duration [${videoDuration}]`, {
            frameTimeWithSpillOver: frameStartTimeWithSpillOver,
            videoDuration: videoDuration,
            frameStartTime: frameStartTime,
          });

          return this._seekToEnd();
        } else {
          return this.seekTimeAndSync(frameTimeToSeek, {
            seekToFrame: frame,
            seekToTime: frameTimeToSeek,
            currentTime: this.getCurrentTime(),
            newTimecode: this.formatToTimecode(frameTimeToSeek),
          });
        }
      }
    } else {
      return of(false);
    }
  }

  /**
   * Three consecutive seeks are executed:
   *  1. Seeks to most accurate video duration. After first seek and video.seeked event, video element should trigger video.ondurationchange and we'll have that value available in video.correctedDuration
   *  2. Seeks to a time just before last frame ends
   *  3. Seeks to most accurate video duration which aligns video.currentTime with video.duration
   *
   * @private
   */
  private _seekToEnd(): Observable<boolean> {
    let videoDuration = this.getMostAccurateDuration();
    console.debug(`%c seekToEnd: ${videoDuration}`, 'color: salmon');
    return this.seekTimeWithoutSync(videoDuration, false, false).pipe(
      switchMap(() => {
        videoDuration = this.getMostAccurateDuration(); // we want fresh value
        let timeInLastFrame = videoDuration - this._syncFrameNudgeTime;
        console.debug(`Seek to before last frame ends`);
        return this.seekTimeWithoutSync(timeInLastFrame, false, false).pipe(
          switchMap(() => {
            console.debug(`Seek to align video.currentTime and video.duration`);
            return this.seekTimeWithoutSync(videoDuration, true, true).pipe(
              tap(() => {
                this.onEnded$.next({});
              })
            );
          })
        );
      })
    );
  }

  /**
   *
   * @param framesCount Positive or negative number of frames. If positive - seek forward, if negative - seek backward.
   */
  private _seekFromCurrentFrame(framesCount: number): Observable<boolean> {
    let currentFrame = this.getCurrentFrame();
    let seekToFrame = this.constrainSeekFrame(currentFrame + framesCount);

    // console.debug(`seekFromCurrentFrame - Current frame: ${currentFrame}, wanted frame: ${seekToFrame}`);

    if (currentFrame !== seekToFrame) {
      if (seekToFrame <= 0) {
        return this._seekToFrame(0);
      } else if (seekToFrame >= this.getTotalFrames()) {
        return this.seekToEnd();
      } else {
        let timeOffset = this.calculateFrameToTime(framesCount);
        let currentTime = Decimal.div(currentFrame, this.getFrameRate()).plus(this._config.frameDurationSpillOverCorrection).toNumber();
        return this.seekFromCurrentTimeAndSync(timeOffset, {
          seekToFrame: seekToFrame,
          currentTime: currentTime,
          seekDirection: framesCount > 0 ? 'fw' : 'bw',
        }).pipe(
          map((result) => {
            return result;
          })
        );
      }
    } else {
      return of(true);
    }
  }

  dispatchVideoTimeChange(): void {
    let currentTime = this.getCurrentTime();
    let frame = this.calculateTimeToFrame(currentTime);

    this.onVideoTimeChange$.next({
      currentTime: currentTime,
      frame: frame,
    });
  }

  private validateVideoLoaded() {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }
  }

  getPlaybackState(): MediaElementPlaybackState | undefined {
    return this._mediaElementPlayback ? this._mediaElementPlayback.state : void 0;
  }

  getVideo(): Video | undefined {
    return this._video;
  }

  getVideoLoadOptions(): VideoLoadOptions | undefined {
    return this._videoLoadOptions;
  }

  getHTMLVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }

  calculateTimeToFrame(time: number): number {
    this.validateVideoLoaded();
    return FrameRateUtil.videoTimeToVideoFrameNumber(time, this.getVideo()!);
  }

  calculateFrameToTime(frameNumber: number): number {
    this.validateVideoLoaded();
    return FrameRateUtil.videoFrameNumberToVideoTime(frameNumber, this.getVideo()!);
  }

  /**
   * Enables preventing video from returning to stored playback state, if user manually initiated action after waitingSyncedMedia was set
   * @protected
   */
  protected resetWaitingSyncedMediaLastPlaybackState() {
    this._waitingSyncedMediaLastPlaybackState = void 0;
  }

  play(): Observable<void> {
    this.resetWaitingSyncedMediaLastPlaybackState();
    return this._play();
  }

  protected _play(): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded() && !this.isPlaying()) {
        this._checkAndCancelPausing();
        // first start request video frame callback cycle
        this.videoElement
          .play()
          .then(() => {
            // handled in HTMLVideoElementEventKeys.PLAYING event handler
            nextCompleteObserver(observer);
          })
          .catch((error) => {
            errorCompleteObserver(observer, error);
          });
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  pause(): Observable<void> {
    this.resetWaitingSyncedMediaLastPlaybackState();
    return this._pause();
  }

  protected _pause(): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded() && this.isPlaying()) {
        let pauseApproximateTime = this.getCurrentTime();
        this._pausingBreaker$ = new Subject<void>();
        this._pausingBreaker$.pipe(take(1)).subscribe({
          next: () => {
            console.debug(`%cpausing breaker triggered`, 'color: gray');
            this.onPause$.next({
              currentTime: pauseApproximateTime,
              currentTimecode: this.formatToTimecode(pauseApproximateTime),
            });
          },
        });

        this._mediaElementPlayback!.setPausing();

        this.onPause$
          .pipe(take(1))
          .subscribe({
            next: () => {
              nextCompleteObserver(observer);
            },
          })
          .add(() => {
            if (this._pausingBreaker$) {
              completeSubject(this._pausingBreaker$);
            }
          });

        this.videoElement.pause();
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  private _checkAndCancelPausing() {
    if (this._mediaElementPlayback!.pausing) {
      nextCompleteSubject(this._pausingBreaker$);
    }
  }

  togglePlayPause(): Observable<void> {
    if (this.isPlaying()) {
      return this.pause();
    } else {
      return this.play();
    }
  }

  isPlaying() {
    return (
      this.isVideoLoaded() &&
      this.getCurrentTime() > 0 &&
      this.getCurrentTime() < this.getDuration() &&
      !this.videoElement.paused && // caution: when using default HTML video controls, when seeking while playing - video is actually paused for a moment
      !this.videoElement.ended &&
      this.videoElement.readyState > this.videoElement.HAVE_CURRENT_DATA
    );
  }

  isPaused() {
    return !this.isPlaying();
  }

  isSeeking(): boolean {
    return !!this.getPlaybackState() && this.getPlaybackState()!.seeking;
  }

  getCurrentTime(): number {
    return this.isVideoLoaded() ? this.videoElement.currentTime : 0;
  }

  getCurrentTimecode(): string {
    return this.formatToTimecode(this.getCurrentTime());
  }

  getPlaybackRate(): number {
    return this.isVideoLoaded() ? this.videoElement.playbackRate : 0;
  }

  setPlaybackRate(playbackRate: number): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        let newPlaybackRate: number;
        try {
          newPlaybackRate = z.coerce.number().min(0.1).max(16).default(VideoController.videoPlaybackRateDefault).parse(playbackRate);
        } catch (e) {
          newPlaybackRate = VideoController.videoPlaybackRateDefault;
        }

        if (newPlaybackRate !== this.getPlaybackRate()) {
          this.onPlaybackRateChange$.pipe(take(1), timeout(60000), takeUntil(this._destroyed$)).subscribe({
            next: () => {
              nextCompleteObserver(observer);
            },
          });
          this.videoElement.playbackRate = playbackRate;
        } else {
          nextCompleteObserver(observer);
        }
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  getVolume(): number {
    if (this.isVideoHlsLoaderInSafari()) {
      return this._lastProvidedMainVolumeHlsLoaderSafari !== void 0 ? this._lastProvidedMainVolumeHlsLoaderSafari : VideoController.videoVolumeDefault;
    } else {
      return this.getVideoElementVolume();
    }
  }

  setVolume(volume: number): Observable<void> {
    if (this.isVideoHlsLoaderInSafari()) {
      this._lastProvidedMainVolumeHlsLoaderSafari = Validators.volume()(volume);
      volume = this._lastProvidedMainVolumeHlsLoaderSafari * this._audioOutputVolume;
    }

    return this._setVolume(volume);
  }

  protected getVideoElementVolume(): number {
    return this.videoElement.volume;
  }

  protected getVideoElementMuted(): boolean {
    return this.videoElement.muted;
  }

  protected _setVolume(volume: number): Observable<void> {
    return passiveObservable((observer) => {
      let newVolume: number;
      try {
        newVolume = Validators.volume()(volume);

        if (newVolume !== this.getVideoElementVolume()) {
          this.onVolumeChange$.pipe(take(1), timeout(60000), takeUntil(this._destroyed$)).subscribe({
            next: () => {
              nextCompleteObserver(observer);
            },
            error: () => {
              // ignore
              nextCompleteObserver(observer);
            },
          });
          this.videoElement.volume = newVolume;
        } else {
          if (this.isVideoHlsLoaderInSafari()) {
            this.onVolumeChange$.pipe(take(1), timeout(60000), takeUntil(this._destroyed$)).subscribe({
              next: () => {
                nextCompleteObserver(observer);
              },
            });

            // if isVideoHlsLoaderInSafari() getVolume() doesn't depend on videoElement, so we have to trigger onVolumeChange because  _lastProvidedMainVolumeHlsLoaderSafari maybe changed
            this.dispatchOnVolumeChange();
          } else {
            nextCompleteObserver(observer);
          }
        }
      } catch (e) {
        // nop
        nextCompleteObserver(observer);
      }
    });
  }

  private dispatchOnVolumeChange() {
    this.onVolumeChange$.next({
      volume: this.getVolume(),
      muted: this.isMuted(),
      oldVolume: this._lastMainVolumeChangeEvent ? this._lastMainVolumeChangeEvent.volume : VideoController.videoVolumeDefault,
    });
  }

  /**
   * return Video duration in seconds
   */
  getDuration(): number {
    this.validateVideoLoaded();

    return this._video!.duration;
  }

  getFrameRate(): number {
    this.validateVideoLoaded();

    return this._video!.frameRate;
  }

  getTotalFrames(): number {
    this.validateVideoLoaded();

    return this._video!.totalFrames;
  }

  getCurrentFrame(): number {
    return this.isVideoLoaded() ? this.calculateTimeToFrame(this.getCurrentTime()) : 0;
  }

  seekToFrame(frame: number): Observable<boolean> {
    console.debug(`%cseekToFrame: ${frame}`, 'color: purple');

    this.validateVideoLoaded();

    frame = z.coerce.number().min(0).max(this.getTotalFrames()).parse(frame);

    if (!this.isVideoLoaded() || (this._mediaElementPlayback!.state.ended && frame >= this.getCurrentFrame())) {
      return of(false);
    }

    this._checkAndCancelPausing();

    return passiveObservable<boolean>((observer) => {
      this._seekToFrame(frame).subscribe({
        next: (value) => nextCompleteObserver(observer, value),
        error: (error) => errorCompleteObserver(observer, error),
      });
    });
  }

  seekFromCurrentFrame(framesCount: number): Observable<boolean> {
    this.validateVideoLoaded();

    framesCount = z.coerce.number().parse(framesCount);

    this._checkAndCancelPausing();

    return passiveObservable<boolean>((observer) => {
      this._seekFromCurrentFrame(framesCount).subscribe({
        next: (value) => nextCompleteObserver(observer, value),
        error: (error) => errorCompleteObserver(observer, error),
      });
    });
  }

  seekFromCurrentTime(timeAmount: number): Observable<boolean> {
    this.validateVideoLoaded();

    timeAmount = z.coerce.number().parse(timeAmount);

    return this.seekToTime(this.getCurrentTime() + timeAmount);
  }

  seekPreviousFrame(): Observable<boolean> {
    this.validateVideoLoaded();

    return this.seekFromCurrentFrame(-1);
  }

  seekNextFrame(): Observable<boolean> {
    this.validateVideoLoaded();

    return this.seekFromCurrentFrame(1);
  }

  seekToTime(time: number): Observable<boolean> {
    // console.debug(`%cseekToTime: ${time}`, 'color: purple');

    this.validateVideoLoaded();

    time = z.coerce.number().parse(time);

    if (this._mediaElementPlayback!.state.ended && time >= this.getMostAccurateDuration()) {
      return of(false);
    }

    this._checkAndCancelPausing();

    return passiveObservable<boolean>((observer) => {
      this.seekTimeAndSync(time, {
        seekToTime: time,
        seekDirection: time === this.getCurrentTime() ? 'o' : time > this.getCurrentTime() ? 'fw' : 'bw',
      }).subscribe({
        next: (value) => nextCompleteObserver(observer, value),
        error: (error) => errorCompleteObserver(observer, error),
      });
    });
  }

  seekToTimecode(timecode: string): Observable<boolean> {
    if (this.isPlaying()) {
      return this.seekToTime(this.parseTimecodeToTime(timecode));
    } else {
      return this.seekToFrame(this.parseTimecodeToFrame(timecode));
    }
  }

  seekToPercent(percent: number): Observable<boolean> {
    this.validateVideoLoaded();

    let percentSafeParsed = z.coerce.number().min(0).max(100).safeParse(percent);

    if (percentSafeParsed.success) {
      let timeToSeek: number;

      if (percent === 0) {
        timeToSeek = 0;
      } else if (percent === 100) {
        timeToSeek = this.getDuration();
      } else {
        timeToSeek = new Decimal(this.getDuration())
          .mul(percent / 100)
          .round()
          .toNumber();
      }

      return this.seekToTime(timeToSeek);
    } else {
      return of(false);
    }
  }

  seekToEnd(): Observable<boolean> {
    this.validateVideoLoaded();
    return passiveObservable<boolean>((observer) => {
      this._seekToEnd().subscribe({
        next: (value) => nextCompleteObserver(observer, value),
        error: (error) => errorCompleteObserver(observer, error),
      });
    });
  }

  formatToTimecode(time: number): string {
    this.validateVideoLoaded();
    time = Validators.videoTime()(time);
    return TimecodeUtil.formatToTimecode(time, this.getVideo()!);
  }

  formatToTimecodeDecimal(time: Decimal): string {
    this.validateVideoLoaded();
    return TimecodeUtil.formatDecimalTimeToTimecode(time, this.getVideo()!);
  }

  parseTimecodeToFrame(timecode: string): number {
    this.validateVideoLoaded();
    timecode = Validators.videoTimecode()(timecode, this.getVideo()!);
    return TimecodeUtil.parseTimecodeToFrame(timecode, new Decimal(this.getVideo()!.frameRate), this.getVideo()!.ffomTimecodeObject);
  }

  parseTimecodeToTime(timecode: string): number {
    this.validateVideoLoaded();
    timecode = Validators.videoTimecode()(timecode, this.getVideo()!);
    return TimecodeUtil.parseTimecodeToTime(timecode, this.getVideo()!, this.getVideo()!.ffomTimecodeObject);
  }

  parseTimecodeToTimeDecimal(timecode: string): Decimal {
    this.validateVideoLoaded();
    timecode = Validators.videoTimecode()(timecode, this.getVideo()!);
    return TimecodeUtil.parseTimecodeToTimeDecimal(timecode, this.getVideo()!, this.getVideo()!.ffomTimecodeObject);
  }

  mute(): Observable<void> {
    let muted = true;
    return passiveObservable((observer) => {
      if (this.isVideoHlsLoaderInSafari()) {
        this._lastProvidedMainMutedHlsLoaderSafari = muted;
      }
      this._setMuted(muted);
      nextCompleteObserver(observer);
    });
  }

  unmute(): Observable<void> {
    let muted = false;
    return passiveObservable((observer) => {
      if (!this._mainAudioActive) {
        console.warn(`Unmuting main audio is disabled. Main audio is not active. (audioPlayMode=${this._config.audioPlayMode}).`);
      } else {
        if (this.isVideoHlsLoaderInSafari()) {
          this._lastProvidedMainMutedHlsLoaderSafari = muted;
          muted = this._audioOutputMuted ? true : muted;
        }
        this._setMuted(muted);
      }
      nextCompleteObserver(observer);
    });
  }

  protected _setMuted(muted: boolean): void {
    if (this.videoElement.muted !== muted) {
      this.videoElement.muted = muted;
    }

    if (this.isVideoHlsLoaderInSafari()) {
      // if isVideoHlsLoaderInSafari() isMuted() doesn't depend on videoElement, so we have to trigger onVolumeChange because  _lastProvidedMainMutedHlsLoaderSafari maybe changed
      this.dispatchOnVolumeChange();
    }
  }

  isMuted(): boolean {
    if (this.isVideoHlsLoaderInSafari()) {
      return this._lastProvidedMainMutedHlsLoaderSafari !== void 0 ? this._lastProvidedMainMutedHlsLoaderSafari : VideoController.videoMutedDefault;
    } else {
      return this.getVideoElementMuted();
    }
  }

  toggleMuteUnmute(): Observable<void> {
    return this.isMuted() ? this.unmute() : this.mute();
  }

  isFullscreen(): boolean {
    if (!this.isVideoLoaded()) {
      return false;
    }

    return this._videoDomController.isFullscreen();
  }

  toggleFullscreen(): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        this._videoDomController.toggleFullscreen().subscribe({
          next: () => {
            nextCompleteObserver(observer);
          },
          error: (error) => errorCompleteObserver(observer, error),
        });
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  protected setAudioTracks(audioTracks: OmpAudioTrack[]): Observable<void> {
    console.debug(`Requested audio tracks load:`, audioTracks);
    return passiveObservable((observer) => {
      this._audioTracks = new Map<string, OmpAudioTrack>(audioTracks.map((audioTrack) => [audioTrack.id, audioTrack]));
      this.onAudioLoaded$.next({
        audioTracks: this.getAudioTracks(),
        activeAudioTrack: this.getActiveAudioTrack(),
      });
      nextCompleteObserver(observer);
    });
  }

  getActiveAudioTrack(): OmpAudioTrack | undefined {
    return this.getAudioTracks().find((p) => p.active); // only one
  }

  getAudioTracks(): OmpAudioTrack[] {
    return [...this._audioTracks.values()];
  }

  setActiveAudioTrack(id: string): Observable<void> {
    // console.debug(`Set active audio track requested for id:`, id);

    return passiveObservable((observer) => {
      let activeTrack = this.getActiveAudioTrack();
      let newActiveTrack = this.getAudioTracks().find((p) => p.id === id);

      if (this.isVideoLoaded()) {
        if (newActiveTrack) {
          this.activateMainAudio();
          if (this._config.audioPlayMode === 'single') {
            this.deactivateSidecarAudioTracks();
          }

          if (newActiveTrack.id !== activeTrack?.id) {
            // console.debug(`Trying to set active audio track to:`, newActiveTrack);
            this._videoLoader!.setActiveAudioTrack(id).subscribe({
              next: (event) => {
                this.updateActiveAudioTrack(id);
                if (this._mainAudioRouter) {
                  this._mainAudioRouter.resetInputsSoloMuteState();
                  this._mainAudioRouter.updateConnections(this._mainAudioRouter.getInitialRoutingConnections());
                }
                nextCompleteObserver(observer);
              },
              error: (err) => {
                errorCompleteObserver(observer, err);
              },
            });
          } else {
            console.debug(`Track already active, set skipped.`, newActiveTrack);
            nextCompleteObserver(observer);
          }
        } else {
          console.debug(`Track not found:`, newActiveTrack);
          nextCompleteObserver(observer);
        }
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  updateAudioTrack(newAudioTrack: OmpAudioTrack): Observable<void> {
    return passiveObservable((observer) => {
      let audioTrack = this.getAudioTracks().find((p) => p.id === newAudioTrack.id);
      if (audioTrack) {
        this._audioTracks.set(audioTrack.id, {
          ...audioTrack,
          label: newAudioTrack.label,
          language: newAudioTrack.language,
        });
        this.onAudioUpdated$.next({
          audioTracks: this.getAudioTracks(),
        });
      }
      nextCompleteObserver(observer);
    });
  }

  activateMainAudio(): Observable<void> {
    return passiveObservable((observer) => {
      this._setMainAudioActive(true);
      nextCompleteObserver(observer);
    });
  }

  deactivateMainAudio(): Observable<void> {
    return passiveObservable((observer) => {
      this._setMainAudioActive(false);
      nextCompleteObserver(observer);
    });
  }

  protected _setMainAudioActive(active: boolean) {
    if (this._mainAudioActive !== active) {
      console.debug(`Setting Main audio active: ${active}`);
      this._setMuted(!active);
      this._mainAudioActive = active;
      this._emitMainAudioChange();
    }
  }

  protected updateActiveAudioTrack(id: string) {
    let activeTrack = this.getActiveAudioTrack();
    let newActiveTrack = this.getAudioTracks().find((p) => p.id === id);

    if (newActiveTrack) {
      // let's say we cannot unset active audio track
      if (newActiveTrack.id !== activeTrack?.id) {
        console.debug(`Trying to update active audio track to:`, newActiveTrack);

        this._audioTracks.forEach((p) => (p.active = false));
        newActiveTrack.active = true;
        newActiveTrack = this.getActiveAudioTrack(); // ensure all is ok
        if (newActiveTrack) {
          console.debug(`Active track updated to :`, newActiveTrack);
          this.onAudioSwitched$.next({
            activeAudioTrack: newActiveTrack,
          });
        }
      } else {
        // console.debug(`Track already active, update skipped, event dispatch canceled:`, newActiveTrack);
      }
    } else {
      console.debug(`Track not found:`, newActiveTrack);
    }
  }

  isVideoLoaded(): boolean {
    return !!this.onVideoLoaded$.value;
  }

  appendHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void> {
    return passiveObservable((observer) => {
      this._helpMenuGroups = [...this.getHelpMenuGroups(), helpMenuGroup];
      this.onHelpMenuChange$.next({
        helpMenuGroups: this.getHelpMenuGroups(),
      });
      nextCompleteObserver(observer);
    });
  }

  prependHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void> {
    return passiveObservable((observer) => {
      this._helpMenuGroups = [helpMenuGroup, ...this.getHelpMenuGroups()];
      this.onHelpMenuChange$.next({
        helpMenuGroups: this.getHelpMenuGroups(),
      });
      nextCompleteObserver(observer);
    });
  }

  clearHelpMenuGroups(): Observable<void> {
    return passiveObservable((observer) => {
      this._helpMenuGroups = [];
      this.onHelpMenuChange$.next({
        helpMenuGroups: this.getHelpMenuGroups(),
      });
      nextCompleteObserver(observer);
    });
  }

  getHelpMenuGroups(): HelpMenuGroup[] {
    return this._helpMenuGroups;
  }

  addSafeZone(videoSafeZone: VideoSafeZone): Observable<VideoSafeZone> {
    return this._videoDomController.addSafeZone(videoSafeZone);
  }

  removeSafeZone(id: string) {
    return this._videoDomController.removeSafeZone(id);
  }

  clearSafeZones(): Observable<void> {
    return this._videoDomController.clearSafeZones();
  }

  getSafeZones(): VideoSafeZone[] {
    return this._videoDomController.getSafeZones();
  }

  isDetachable(): boolean {
    return false;
  }

  canDetach(): boolean {
    return false;
  }

  canAttach(): boolean {
    return false;
  }

  getVideoWindowPlaybackState(): VideoWindowPlaybackState {
    return 'attached';
  }

  detachVideoWindow(): Observable<void> {
    throw new Error('I am not detachable');
  }

  attachVideoWindow(): Observable<void> {
    throw new Error('I am not attachable');
  }

  isPiPSupported(): boolean {
    return this._videoDomController.isPiPSupported();
  }

  enablePiP(): Observable<void> {
    return passiveObservable((observer) => {
      if (!this.isVideoLoaded()) {
        errorCompleteObserver(observer, 'Video is not loaded');
      } else if (!this.isPiPSupported()) {
        errorCompleteObserver(observer, 'Picture in picture is not supported in this browser');
      } else {
        if (!document.pictureInPictureElement && document.pictureInPictureEnabled) {
          this.getHTMLVideoElement()
            .requestPictureInPicture()
            .then(() => console.debug('Video entered picture in picture mode'));
        }
        nextCompleteObserver(observer);
      }
    });
  }

  disablePiP(): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        if (document.pictureInPictureElement && document.pictureInPictureEnabled) {
          document.exitPictureInPicture().then(() => console.debug('Video exited picture in picture mode'));
        }
        nextCompleteObserver(observer);
      } else {
        errorCompleteObserver(observer, 'Video is not loaded');
      }
    });
  }

  protected setSubtitlesTracks(subtitlesVttTracks: SubtitlesVttTrack[]): Observable<void> {
    return passiveObservable((observer) => {
      this._removeAllSubtitlesTracks(false);
      if (subtitlesVttTracks && subtitlesVttTracks.length > 0) {
        forkJoin(subtitlesVttTracks.map((p) => this.createSubtitlesVttTrack(p))).subscribe({
          next: (subtitlesVttTracks) => {
            this._subtitlesTracks = new Map<string, SubtitlesVttTrack>(subtitlesVttTracks.map((subtitlesVttTrack) => [subtitlesVttTrack.id, subtitlesVttTrack]));
            this.onSubtitlesLoaded$.next(this.createSubtitlesEvent());
            nextCompleteObserver(observer);
          },
          error: (err) => {
            errorCompleteObserver(observer, err);
          },
        });
      } else {
        this.onSubtitlesLoaded$.next(this.createSubtitlesEvent());
        nextCompleteObserver(observer);
      }
    });
  }

  createSubtitlesVttTrack(subtitlesVttTrack: SubtitlesVttTrack): Observable<SubtitlesVttTrack> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        this._createSubtitlesVttTrack(subtitlesVttTrack).subscribe({
          next: (value) => {
            // console.debug('Created subtitles track', subtitlesVttTrack);
            nextCompleteObserver(observer, value);
            if (subtitlesVttTrack.default) {
              let prevDefaultTrack = Array.from(this._subtitlesTracks.values()).find((track) => track.default && track.id !== subtitlesVttTrack.id);
              if (prevDefaultTrack) {
                prevDefaultTrack.default = false;
              }
              this.showSubtitlesTrack(subtitlesVttTrack.id);
            }
          },
          error: (error) => {
            console.error(error);
            errorCompleteObserver(observer, error);
          },
        });
      } else {
        let message = 'Failed to create subtitles track, video not loaded';
        console.debug(message, subtitlesVttTrack);
        errorCompleteObserver(observer, message);
      }
    });
  }

  protected _createSubtitlesVttTrack(subtitlesVttTrack: SubtitlesVttTrack): Observable<SubtitlesVttTrack | undefined> {
    return new Observable<SubtitlesVttTrack>((observer) => {
      this._removeSubtitlesTrack(subtitlesVttTrack.id);

      this._videoDomController.appendHTMLTrackElement(subtitlesVttTrack).subscribe({
        next: (element) => {
          if (element) {
            this._subtitlesTracks.set(subtitlesVttTrack.id, subtitlesVttTrack);
            this.onSubtitlesCreate$.next(this.createSubtitlesEvent());
            // console.debug('Created subtitles track, track appended to DOM', subtitlesVttTrack);
            nextCompleteObserver(observer, subtitlesVttTrack);
          } else {
            let message = `Failed to create subtitles track, appending to DOM failed for ${JSON.stringify(subtitlesVttTrack)}`;
            console.debug(message);
            errorCompleteObserver(observer, message);
          }
        },
        error: (error) => {
          errorCompleteObserver(observer, error);
        },
      });
    });
  }

  getSubtitlesTracks(): SubtitlesVttTrack[] {
    return this.isVideoLoaded() ? [...this._subtitlesTracks.values()] : [];
  }

  removeAllSubtitlesTracks(): Observable<void> {
    return passiveObservable((observer) => {
      this._removeAllSubtitlesTracks();
      nextCompleteObserver(observer);
    });
  }

  protected _removeAllSubtitlesTracks(emitEvent = true): void {
    if (this._subtitlesTracks.size > 0) {
      [...this._subtitlesTracks.values()].map((p) => this._removeSubtitlesTrack(p.id, emitEvent));
    }
  }

  removeSubtitlesTrack(id: string): Observable<void> {
    return passiveObservable((observer) => {
      this._removeSubtitlesTrack(id);
      nextCompleteObserver(observer);
    });
  }

  protected _removeSubtitlesTrack(id: string, emitEvent = true): void {
    if (this.isVideoLoaded()) {
      let track = this._subtitlesTracks.get(id);
      if (track) {
        // remove existing track
        this._subtitlesTracks.delete(id);

        // remove existing track from HTML DOM
        this._videoDomController.removeTextTrackById(track.id);

        if (emitEvent) {
          this.onSubtitlesRemove$.next(this.createSubtitlesEvent());
        }
      }
    }
  }

  getActiveSubtitlesTrack(): SubtitlesVttTrack | undefined {
    return this._activeSubtitlesTrack;
  }

  showSubtitlesTrack(id: string): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        let textTracksList = this._videoDomController.getTextTrackList();
        if (textTracksList && textTracksList.length > 0) {
          for (let i = 0; i < textTracksList.length; i++) {
            let textTrack = textTracksList[i];
            if (textTrack.id !== id && !(textTrack.mode === 'hidden' || textTrack.mode === 'disabled')) {
              textTrack.mode = 'hidden';
            }
          }
        }

        let subtitlesVttTrack = this._subtitlesTracks.get(id);
        if (subtitlesVttTrack) {
          let textTrack = this._videoDomController.getTextTrackById(subtitlesVttTrack.id);

          if (textTrack) {
            textTrack.mode = 'showing';
            subtitlesVttTrack.hidden = false;

            this._activeSubtitlesTrack = subtitlesVttTrack;

            this.onSubtitlesShow$.next(this.createSubtitlesEvent());
          }
        } else {
          console.debug(`Cannot show subtitle track: ${id}. Subtitle track not found.`);
        }
      }
      nextCompleteObserver(observer);
    });
  }

  hideSubtitlesTrack(id: string): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        let track = this._subtitlesTracks.get(id);
        if (track) {
          let domTextTrack = this._videoDomController.getTextTrackById(track.id);
          if (domTextTrack) {
            domTextTrack.mode = 'hidden';
            track.hidden = true;

            this.onSubtitlesHide$.next(this.createSubtitlesEvent());
          }
        }
      }
      nextCompleteObserver(observer);
    });
  }

  private createSubtitlesEvent(): SubtitlesEvent {
    return {
      tracks: this.getSubtitlesTracks(),
      currentTrack: this.getActiveSubtitlesTrack(),
    };
  }

  protected createAudioContext(contextOptions?: AudioContextOptions): AudioContext {
    if (!this._audioContext) {
      // console.debug('Creating AudioContext');
      this._audioContext = new AudioContext(contextOptions);

      this._audioOutputNode = this._audioContext.createGain();
      this._audioOutputNode.channelCountMode = 'max';
      this._audioOutputNode.connect(this._audioContext.destination);

      this._sidecarAudiosOutputNode = this._audioContext.createGain();
      this._sidecarAudiosOutputNode.channelCountMode = 'max';
      this._sidecarAudiosOutputNode.connect(this._audioOutputNode);

      this.onPlay$.pipe(takeUntil(this._audioContextResumeBreaker$), takeUntil(this._destroyed$)).subscribe({
        next: () => {
          if (this._audioContext?.state !== 'running') {
            // this can be executed only after user gesture, so we have to bind it on some user gesture event (play) to enable it
            this._audioContext?.resume().then((event) => {
              console.debug('AudioContext resumed');
              nextCompleteSubject(this._audioContextResumeBreaker$);
            });
          }
        },
      });
    } else {
      console.debug('AudioContext already created');
    }
    return this._audioContext;
  }

  protected createMainAudio() {
    this._mainAudioNode = this._audioContext.createGain();
    this._mainAudioNode.channelCountMode = 'max';

    if (this._mediaElementAudioSourceNode) {
      this._mediaElementAudioSourceNode.disconnect();
    }

    this._mediaElementAudioSourceNode = this._audioContext.createMediaElementSource(this.getHTMLVideoElement());
    this._mediaElementAudioSourceNode.connect(this._mainAudioNode).connect(this._audioOutputNode);

    this._emitMainAudioChange();
    this._emitSoloMute();
  }

  getAudioContext(): AudioContext {
    return this._audioContext;
  }

  getAudioOutputNode(): AudioNode {
    return this._audioOutputNode;
  }

  getSidecarAudiosOutputNode(): AudioNode {
    return this._sidecarAudiosOutputNode;
  }

  getAudioOutputVolume(): number {
    return this._audioOutputVolume;
  }

  isAudioOutputMuted(): boolean {
    return this._audioOutputMuted;
  }

  setAudioOutputMuted(muted: boolean): Observable<void> {
    return passiveObservable((observer) => {
      this.updateAudioOutputVolume(this._audioOutputVolume, muted);
      nextCompleteObserver(observer);
    });
  }

  toggleAudioOutputMuteUnmute(): Observable<void> {
    return passiveObservable((observer) => {
      this.updateAudioOutputVolume(this._audioOutputVolume, !this.isAudioOutputMuted());
      nextCompleteObserver(observer);
    });
  }

  setAudioOutputVolume(volume: number): Observable<void> {
    return passiveObservable((observer) => {
      this.updateAudioOutputVolume(volume, false); // unmutes as well
      nextCompleteObserver(observer);
    });
  }

  muteAudioOutput(): Observable<void> {
    return passiveObservable((observer) => {
      this.updateAudioOutputVolume(this._audioOutputVolume, true);
      nextCompleteObserver(observer);
    });
  }

  unmuteAudioOutput(): Observable<void> {
    return passiveObservable((observer) => {
      this.updateAudioOutputVolume(this._audioOutputVolume, false);
      nextCompleteObserver(observer);
    });
  }

  protected updateAudioOutputVolume(volume: number, muted: boolean) {
    let oldVolume = this._audioOutputVolume;
    this._audioOutputVolume = volume;
    this._audioOutputMuted = muted;

    this._audioOutputNode.gain.value = this._audioOutputMuted ? 0 : this._audioOutputVolume;

    this.onAudioOutputVolumeChange$.next({
      volume: this._audioOutputVolume,
      muted: this._audioOutputMuted,
      oldVolume: oldVolume,
    });
  }

  getMainAudioNode(): AudioNode | undefined {
    return this._mainAudioNode;
  }

  getMainAudioState(): OmpMainAudioState | undefined {
    return {
      active: this._mainAudioActive,
      audioRouterState: this._mainAudioRouter?.getAudioRouterState(),
      audioPeakProcessorState: this._mainAudioPeakProcessor?.getAudioPeakProcessorState(),
      numberOfChannels: this._mainAudioNode ? this._mainAudioNode.channelCount : 0,
      interleavedAudioEffects: this.getInterleavedAudioEffects(),
    };
  }

  getMainAudioRouter(): OmpAudioRouter | undefined {
    return this._mainAudioRouter;
  }

  getMainAudioInputSoloMuteState(): OmpMainAudioInputSoloMuteState | undefined {
    return {
      audioRouterInputSoloMuteState: this._mainAudioRouter?.getAudioRouterInputSoloMuteState(),
    };
  }

  getMainAudioRouterInitialRoutingConnections(): OmpAudioRoutingConnection[] | undefined {
    return this._mainAudioRouter?.getInitialRoutingConnections();
  }

  setMainAudioRouterInitialRoutingConnections(connections: OmpAudioRoutingConnection[]): Observable<void> {
    return passiveObservable((observer) => {
      if (this._mainAudioRouter) {
        this._mainAudioRouter.setInitialRoutingConnections(connections);
        nextCompleteObserver(observer);
      } else {
        console.debug('Main audio router not created.');
        nextCompleteObserver(observer);
      }
    });
  }

  createMainAudioRouter(inputsNumber: number, outputsNumber?: number): Observable<OmpAudioRouterState> {
    return passiveObservable((observer) => {
      if (!this._mainAudioNode) {
        errorCompleteObserver(observer, 'Main audio not created yet');
      } else if (this._mainAudioRouter) {
        this._mainAudioRouter.resetInputsSoloMuteState();
        console.debug('Main audio router already created');
        nextCompleteObserver(observer, this._mainAudioRouter.getAudioRouterState());
      } else {
        this._createAudioRouter(inputsNumber, outputsNumber).subscribe({
          next: (audioRouter) => {
            this._mainAudioRouter = audioRouter;

            this._mainAudioNode!.channelCount = this._mainAudioRouter.inputsNumber;

            this._sourceSlot.outputNode.disconnect(this._destinationSlot.inputNode);
            this._mainAudioRouter.connectSource(this._sourceSlot.outputNode);

            this._emitMainAudioChange();
            this._emitSoloMute();

            this._mainAudioRouter.onChange$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
              this._emitMainAudioChange();
            });

            this._mainAudioRouter.onInputSoloMute$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
              this._emitSoloMute();
            });

            nextCompleteObserver(observer, this._mainAudioRouter.getAudioRouterState());
          },
        });
      }
    });
  }

  createMainAudioRouterWithOutputsResolver(inputsNumber: number, outputsNumberResolver: (maxChannelCount: number) => number): Observable<OmpAudioRouterState> {
    return passiveObservable((observer) => {
      if (!this._mainAudioNode) {
        errorCompleteObserver(observer, 'Main audio not created yet');
      } else if (this._mainAudioRouter) {
        this._mainAudioRouter.resetInputsSoloMuteState();
        console.debug('Main audio router already created');
        nextCompleteObserver(observer, this._mainAudioRouter.getAudioRouterState());
      } else {
        this._createAudioRouterWithOutputsResolver(inputsNumber, outputsNumberResolver).subscribe({
          next: (audioRouter) => {
            this._mainAudioRouter = audioRouter;

            this._mainAudioNode!.channelCount = this._mainAudioRouter.inputsNumber;

            this._sourceSlot.outputNode.disconnect(this._audioOutputNode);
            this._mainAudioRouter.connectSource(this._sourceSlot.outputNode);

            this._emitMainAudioChange();
            this._emitSoloMute();

            this._mainAudioRouter.onChange$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
              this._emitMainAudioChange();
            });

            this._mainAudioRouter.onInputSoloMute$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
              this._emitSoloMute();
            });

            nextCompleteObserver(observer, this._mainAudioRouter.getAudioRouterState());
          },
        });
      }
    });
  }

  protected _emitMainAudioChange() {
    let mainAudioState = this.getMainAudioState();
    let event: MainAudioChangeEvent | undefined = mainAudioState
      ? {
          mainAudioState: mainAudioState,
        }
      : void 0;
    this.onMainAudioChange$.next(event);
  }

  protected _emitSoloMute() {
    let mainAudioInputSoloMuteState = this.getMainAudioInputSoloMuteState();
    let event: MainAudioInputSoloMuteEvent | undefined = mainAudioInputSoloMuteState
      ? {
          mainAudioInputSoloMuteState,
        }
      : void 0;
    this.onMainAudioInputSoloMute$.next(event);
  }

  createMainAudioPeakProcessor(audioMeterStandard?: AudioMeterStandard): Observable<Observable<AudioPeakProcessorMessageEvent>> {
    return passiveObservable<Observable<AudioPeakProcessorMessageEvent>>((observer) => {
      if (!this._mainAudioNode) {
        errorCompleteObserver(observer, 'Main audio not created yet');
      } else if (this._mainAudioPeakProcessor) {
        console.debug('Main audio peak processor already created');
        nextCompleteObserver(observer, this.onMainAudioPeakProcessorMessage$);
      } else {
        this._mainAudioPeakProcessor = new OmpAudioPeakProcessor(this._audioContext, audioMeterStandard);
        this._mainAudioPeakProcessor.onAudioWorkletLoaded$.pipe(filter((p) => !!p)).subscribe({
          next: () => {
            this._mainAudioPeakProcessor!.connectSource(this._mainAudioNode!);

            this._emitMainAudioChange();
            nextCompleteObserver(observer, this.onMainAudioPeakProcessorMessage$);
          },
          error: (e) => {
            errorCompleteObserver(observer, e);
          },
        });

        this._mainAudioPeakProcessor!.onMessage$.pipe(takeUntil(this._destroyed$)).subscribe({
          next: (event) => {
            this.onMainAudioPeakProcessorMessage$.next(event);
          },
        });
      }
    });
  }

  updateMainAudioRouterConnections(connections: OmpAudioRoutingConnection[]): Observable<void> {
    return passiveObservable((observer) => {
      if (this._mainAudioRouter) {
        this._mainAudioRouter.updateConnections(connections);
        nextCompleteObserver(observer);
      } else {
        console.debug('Main audio router not created.');
        nextCompleteObserver(observer);
      }
    });
  }

  setMainAudioEffectsGraphs(effectsGraphDef: OmpAudioEffectsGraphDef, effectsGraphConnection: OmpAudioEffectsGraphConnection): Observable<void> {
    if (effectsGraphConnection.slot === 'source') {
      if (this._isSourceSlotEffectAttaching) {
        return passiveObservable((observer) => errorCompleteObserver(observer, `Can't set new source slot effect graph before previous one initialized`));
      }
      this._isSourceSlotEffectAttaching = true;
    } else if (effectsGraphConnection.slot === 'destination') {
      if (this._isDestinationSlotEffectAttaching) {
        return passiveObservable((observer) => errorCompleteObserver(observer, `Can't set new destination slot effect graph before previous one initialized`));
      }
      this._isDestinationSlotEffectAttaching = true;
    }
    return passiveObservable((observer) => {
      if (effectsGraphConnection.slot === 'router') {
        if (this._mainAudioRouter) {
          this._mainAudioRouter.setAudioEffectsGraphs(effectsGraphDef, effectsGraphConnection.routingPath).subscribe(() => {
            nextCompleteObserver(observer);
          });
        } else {
          console.debug('Main audio router not created.');
          nextCompleteObserver(observer);
        }
      } else if (effectsGraphConnection.slot === 'source' || effectsGraphConnection.slot === 'destination') {
        this._removeMainAudioInterleavedEffectsGraph(effectsGraphConnection);

        this._setMainAudioInterleavedEffectsGraph(effectsGraphDef, effectsGraphConnection).subscribe({
          next: () => {
            this._emitMainAudioChange();
            if (effectsGraphConnection.slot === 'source') {
              this._isSourceSlotEffectAttaching = false;
            } else {
              this._isDestinationSlotEffectAttaching = false;
            }
            nextCompleteObserver(observer);
          },
          error: (err) => {
            if (effectsGraphConnection.slot === 'source') {
              this._isSourceSlotEffectAttaching = false;
            } else {
              this._isDestinationSlotEffectAttaching = false;
            }
            errorCompleteObserver(observer, err);
          },
        });
      } else {
        errorCompleteObserver(observer, 'Slot not supported.');
      }
    });
  }

  public _setMainAudioInterleavedEffectsGraph(effectsGraphDef: OmpAudioEffectsGraphDef, effectsGraphConnection: OmpAudioEffectsGraphConnection): Observable<void> {
    let slot: OmpAudioEffectsSlot;

    if (effectsGraphConnection.slot === 'source') {
      slot = this._sourceSlot;
    } else if (effectsGraphConnection.slot === 'destination') {
      slot = this._destinationSlot;
    } else {
      throw new OmpError('Invalid interleaved slot selected');
    }
    let effectsGraph = new OmpAudioEffectsGraph(this.getAudioContext(), effectsGraphDef);

    return new Observable((observer) => {
      effectsGraph.initialize().subscribe(() => {
        slot.inputNode.disconnect(slot.outputNode);
        effectsGraph.sourceEffects.forEach((sourceEffect) => {
          const inputNodes = sourceEffect.getInputNodes();
          inputNodes.forEach((inputNode) => {
            slot.inputNode.connect(inputNode);
          });
        });

        effectsGraph.destinationEffects.forEach((destinationEffect) => {
          destinationEffect.getOutputNode().connect(slot.outputNode);
        });

        if (effectsGraphConnection.slot === 'source') {
          this._sourceSlotEffectsGraph = effectsGraph;
        } else if (effectsGraphConnection.slot === 'destination') {
          this._destinationSlotEffectsGraph = effectsGraph;
        }

        nextCompleteObserver(observer);
      });
    });
  }

  protected _createEffectsSlots() {
    if (this._sourceSlot) {
      throw new OmpError(`Source slot already created for main audio`);
    }

    if (this._destinationSlot) {
      throw new OmpError(`Destination slot already created for main audio`);
    }

    if (!this._mainAudioNode) {
      throw new OmpError(`Main audio node is not created. Source slot can't be created`);
    }

    this._sourceSlot = {
      inputNode: this._mainAudioNode,
      outputNode: this.getAudioContext().createGain(),
    };

    this._destinationSlot = {
      inputNode: this.getAudioContext().createGain(),
      outputNode: this._audioOutputNode,
    };

    this._mainAudioNode.disconnect(this._audioOutputNode);
    this._sourceSlot.outputNode.connect(this._destinationSlot.inputNode);

    // short circuit the slots
    this._sourceSlot.inputNode.connect(this._sourceSlot.outputNode);
    this._destinationSlot.inputNode.connect(this._destinationSlot.outputNode);
  }

  removeMainAudioEffectsGraphs(effectsGraphConnection: OmpAudioEffectsGraphConnection): Observable<void> {
    return passiveObservable((observer) => {
      if (effectsGraphConnection.slot === 'router') {
        if (this._mainAudioRouter) {
          this._mainAudioRouter.removeAudioEffectsGraphs(effectsGraphConnection.routingPath);
          nextCompleteObserver(observer);
        } else {
          console.debug('Main audio router not created.');
          nextCompleteObserver(observer);
        }
      } else if (effectsGraphConnection.slot === 'source') {
        if (this._isSourceSlotEffectAttaching) {
          errorCompleteObserver(observer, `Can't remove audio effect in slot ${effectsGraphConnection.slot} before it is initialized`);
        } else {
          this._removeMainAudioInterleavedEffectsGraph(effectsGraphConnection);
          this._emitMainAudioChange();
          nextCompleteObserver(observer);
        }
      } else if (effectsGraphConnection.slot === 'destination') {
        if (this._isDestinationSlotEffectAttaching) {
          errorCompleteObserver(observer, `Can't remove audio effect in slot ${effectsGraphConnection.slot} before it is initialized`);
        } else {
          this._removeMainAudioInterleavedEffectsGraph(effectsGraphConnection);
          this._emitMainAudioChange();
          nextCompleteObserver(observer);
        }
      } else {
        errorCompleteObserver(observer, 'Slot not supported.');
      }
    });
  }

  protected _removeMainAudioInterleavedEffectsGraph(effectGraphConnection: OmpAudioEffectsGraphConnection) {
    let effectsGraph: OmpAudioEffectsGraph | undefined;
    let effectsSlot: OmpAudioEffectsSlot;
    if (effectGraphConnection.slot === 'source') {
      effectsGraph = this._sourceSlotEffectsGraph;
      effectsSlot = this._sourceSlot;
    } else if (effectGraphConnection.slot === 'destination') {
      effectsGraph = this._destinationSlotEffectsGraph;
      effectsSlot = this._destinationSlot;
    } else {
      throw new OmpError('Slot not supported for interleaved audio');
    }

    if (!effectsGraph) {
      return;
    }

    effectsGraph.sourceEffects.forEach((sourceEffect) => {
      const inputNodes = sourceEffect.getInputNodes();
      inputNodes.forEach((inputNode) => {
        effectsSlot.inputNode.disconnect(inputNode);
      });
    });

    effectsGraph.destinationEffects.forEach((destinationEffect) => {
      destinationEffect.getOutputNode().disconnect(effectsSlot.outputNode);
    });

    effectsSlot.inputNode.connect(effectsSlot.outputNode);
    effectsGraph.destroy();
    if (effectGraphConnection.slot === 'source') {
      this._sourceSlotEffectsGraph = undefined;
    } else {
      this._destinationSlotEffectsGraph = undefined;
    }
  }

  setMainAudioEffectsParams(param: OmpAudioEffectParam, effectGraphConnection: OmpAudioEffectsGraphConnection, filter?: OmpAudioEffectFilter): Observable<void> {
    if (effectGraphConnection.slot === 'router') {
      return passiveObservable((observer) => {
        if (this._mainAudioRouter) {
          this._mainAudioRouter.setAudioEffectsParams(param, {...filter, routingPath: effectGraphConnection.routingPath});
          nextCompleteObserver(observer);
        } else {
          console.debug('Main audio router not created.');
          nextCompleteObserver(observer);
        }
      });
    } else if (effectGraphConnection.slot === 'source') {
      return passiveObservable((observer) => {
        this._setMainAudioEffectsParams(param, effectGraphConnection, filter);
        this._emitMainAudioChange();
        nextCompleteObserver(observer);
      });
    } else {
      return passiveObservable((observer) => errorCompleteObserver(observer, 'Slot not supported.'));
    }
  }

  protected _setMainAudioEffectsParams(param: OmpAudioEffectParam, effectGraphConnection: OmpAudioEffectsGraphConnection, filter?: OmpAudioEffectFilter) {
    if (effectGraphConnection.slot === 'source') {
      if (!this._sourceSlotEffectsGraph) {
        throw new OmpError('Source slot effects graph not defined for main audio');
      }
      let effects = this._sourceSlotEffectsGraph.findAudioEffects(filter);
      effects.forEach((effect) => effect.setParam(param));
    }
  }

  protected getInterleavedAudioEffects(): AudioEffectBundle[] {
    const effects: AudioEffectBundle[] = [];

    if (this._sourceSlotEffectsGraph) {
      effects.push({
        effectsGraphConnection: {slot: 'source'},
        effectsGraphDef: this._sourceSlotEffectsGraph.toDef(),
      });
    }

    if (this._destinationSlotEffectsGraph) {
      effects.push({
        effectsGraphConnection: {slot: 'destination'},
        effectsGraphDef: this._destinationSlotEffectsGraph.toDef(),
      });
    }

    return effects;
  }

  toggleMainAudioRouterSolo(routingPath: OmpAudioRoutingInputType): Observable<void> {
    return passiveObservable((observer) => {
      if (this._mainAudioRouter) {
        this._mainAudioRouter.toggleSolo(routingPath);
        nextCompleteObserver(observer);
      } else {
        console.debug('Main audio router not created.');
        nextCompleteObserver(observer);
      }
    });
  }

  toggleMainAudioRouterMute(routingPath: OmpAudioRoutingInputType): Observable<void> {
    return passiveObservable((observer) => {
      if (this._mainAudioRouter) {
        this._mainAudioRouter.toggleMute(routingPath);
        nextCompleteObserver(observer);
      } else {
        console.debug('Main audio router not created.');
        nextCompleteObserver(observer);
      }
    });
  }

  protected _createAudioRouter(inputsNumber: number, outputsNumber?: number): Observable<OmpAudioRouter> {
    if (isNullOrUndefined(outputsNumber)) {
      return passiveObservable((observer) => {
        let audioRouter = new OmpAudioRouter(this._audioContext, this._destinationSlot.inputNode, inputsNumber);
        nextCompleteObserver(observer, audioRouter);
      });
    } else {
      return this._createAudioRouterWithOutputsResolver(inputsNumber, (maxChannelCount: number) => outputsNumber!);
    }
  }

  protected _createAudioRouterWithOutputsResolver(inputsNumber: number, outputsNumberResolver: (maxChannelCount: number) => number): Observable<OmpAudioRouter> {
    return passiveObservable((observer) => {
      let audioRouter = new OmpAudioRouter(this._audioContext, this._destinationSlot.inputNode, inputsNumber, outputsNumberResolver);
      nextCompleteObserver(observer, audioRouter);
    });
  }

  protected destroyAudioContext() {
    if (this._audioContext) {
      try {
        // this._mediaElementAudioSource?.disconnect();
        if (this._audioContext.state !== 'closed') {
          this._audioContext.close().then(
            () => {
              console.debug('AudioContext closed');
            },
            (reason) => {
              console.debug('Problem while closing AudioContext', reason);
            }
          );
        }
      } catch (e) {
        console.debug('Problems in disposing AudioContext', e);
        console.debug(e);
      }
    }
  }

  getThumbnailVttUrl(): string | undefined {
    return this._thumbnailVttUrl;
  }

  loadThumbnailVttUrl(thumbnailVttUrl: string): Observable<void> {
    return passiveObservable((observer) => {
      this._thumbnailVttUrl = thumbnailVttUrl;
      this.onThumbnailVttUrlChanged$.next({thumbnailVttUrl});
      this._videoDomController.loadThumbnailVtt(thumbnailVttUrl);
      nextCompleteObserver(observer);
    });
  }

  getConfig(): VideoControllerConfig {
    return this._config;
  }

  getHls(): Hls | undefined {
    if (this._videoLoader instanceof VideoHlsLoader) {
      return this._videoLoader.getHls();
    } else {
      return void 0;
    }
  }

  updateActiveNamedEventStreams(eventNames: OmpNamedEventEventName[]): Observable<void> {
    return passiveObservable((observer) => {
      this._activeNamedEventStreams = [...[...new Set(eventNames)]];
      this.onActiveNamedEventStreamsChange$.next(this.getActiveNamedEventStreams());
      nextCompleteObserver(observer);
    });
  }

  getActiveNamedEventStreams(): OmpNamedEventEventName[] {
    return [...this._activeNamedEventStreams];
  }

  loadBlackVideo(): Observable<Video> {
    return this.loadVideo(this._blackMp4Url, {
      frameRate: 30,
      protocol: 'native',
    });
  }

  getSidecarAudios(): SidecarAudioApi[] {
    return [...this._sidecarAudios.values()];
  }

  getSidecarAudio(id: string): SidecarAudioApi | undefined {
    return this._sidecarAudios.get(id);
  }

  getSidecarAudioState(id: string): OmpSidecarAudioState | undefined {
    return this.getSidecarAudio(id)?.getSidecarAudioState();
  }

  getSidecarAudioStates(): OmpSidecarAudioState[] {
    return this.getSidecarAudios().map((p) => p.getSidecarAudioState());
  }

  getSidecarAudioInputSoloMuteState(id: string): OmpSidecarAudioInputSoloMuteState | undefined {
    return this.getSidecarAudio(id)?.getSidecarAudioInputSoloMuteState();
  }

  getSidecarAudioInputSoloMuteStates(): OmpSidecarAudioInputSoloMuteState[] {
    return this.getSidecarAudios().map((p) => p.getSidecarAudioInputSoloMuteState());
  }

  getSidecarAudioRouterInitialRoutingConnections(id: string): OmpAudioRoutingConnection[] | undefined {
    return this.getSidecarAudio(id)?.audioRouter?.getInitialRoutingConnections();
  }

  setSidecarAudioRouterInitialRoutingConnections(id: string, connections: OmpAudioRoutingConnection[]): Observable<void> {
    return passiveObservable((observer) => {
      let sidecarAudio = this.getSidecarAudio(id);
      if (sidecarAudio && sidecarAudio.audioRouter) {
        sidecarAudio.audioRouter.setInitialRoutingConnections(connections);
        nextCompleteObserver(observer);
      } else {
        errorCompleteObserver(observer, 'Sidecar audio or sidecar audio router not found');
      }
    });
  }

  createSidecarAudioTrack(track: OmpAudioTrackCreateType): Observable<OmpAudioTrack> {
    return passiveObservable((observer) => {
      this._createSidecarAudioTrack(track).subscribe({
        next: (result) => {
          nextCompleteObserver(observer, result);
        },
        error: (error) => {
          console.error(error);
          errorCompleteObserver(observer, 'Error creating sidecar audio track');
        },
      });
    });
  }

  protected _createSidecarAudioTrack(track: OmpAudioTrackCreateType): Observable<OmpAudioTrack> {
    return this._createSidecarAudio(track).pipe(map((p) => p.audioTrack));
  }

  createSidecarAudioTracks(tracks: OmpAudioTrackCreateType[]): Observable<OmpAudioTrack[]> {
    return passiveObservable<OmpAudioTrack[]>((observer) => {
      this._createSidecarAudios(tracks).subscribe({
        next: (sidecarAudios) => {
          nextCompleteObserver(
            observer,
            sidecarAudios.map((p) => p.audioTrack)
          );
        },
        error: (err) => {
          errorCompleteObserver(observer, 'Error creating sidecar audio tracks');
        },
      });
    });
  }

  protected _createSidecarAudio(track: OmpAudioTrackCreateType): Observable<SidecarAudioApi> {
    return new Observable<SidecarAudioApi>((observer) => {
      if (StringUtil.isEmpty(track.src) || StringUtil.isEmpty(track.label)) {
        errorCompleteObserver(observer, 'track.src and track.label must be provided');
      } else if (track.id && this._sidecarAudios.has(track.id)) {
        errorCompleteObserver(observer, `track.id already exists ${track.id}`);
      } else {
        let sidecarAudioTrack: OmpAudioTrack = {
          id: StringUtil.isEmpty(track.id) ? CryptoUtil.uuid() : track.id!,
          label: track.label,
          src: track.src,
          language: track.language,
          embedded: false,
          active: !!track.active,
          channelCount: track.channelCount,
        };

        let sidecarAudio = SidecarAudioFactory.createSidecarAudio(this, sidecarAudioTrack);
        this._sidecarAudios.set(sidecarAudioTrack.id, sidecarAudio);

        console.debug('Created sidecar audio', sidecarAudio.getSidecarAudioState());

        this.onSidecarAudioCreate$.next({
          sidecarAudioState: sidecarAudio.getSidecarAudioState(),
        });

        console.debug('Loading sidecar audio', track);

        sidecarAudio
          .loadSource()
          .pipe(timeout(60000))
          .subscribe({
            next: (event) => {
              this.onSidecarAudioLoaded$.next({
                sidecarAudioState: sidecarAudio.getSidecarAudioState(),
              });

              let removed$ = this.onSidecarAudioRemove$.pipe(filter((p) => p.sidecarAudioState.audioTrack.id === sidecarAudio.audioTrack.id));

              sidecarAudio.onVideoCurrentTimeBuffering$
                .pipe(takeUntil(removed$)) // take until removed
                .pipe(takeUntil(this._destroyed$))
                .subscribe({
                  next: (buffering) => {
                    this.onSidecarAudioVideoCurrentTimeBuffering$.next({
                      sidecarAudioState: sidecarAudio.getSidecarAudioState(),
                      buffering: buffering,
                    });
                  },
                });

              sidecarAudio.onStateChange$
                .pipe(takeUntil(removed$)) // take until removed
                .pipe(takeUntil(this._destroyed$))
                .subscribe({
                  next: (sidecarAudioState) => {
                    this.onSidecarAudioChange$.next({
                      sidecarAudioState: sidecarAudioState,
                    });
                  },
                });

              sidecarAudio.onInputSoloMute$
                .pipe(takeUntil(removed$)) // take until removed
                .pipe(takeUntil(this._destroyed$))
                .subscribe({
                  next: (sidecarAudioInputSoloMuteState) => {
                    this.onSidecarAudioInputSoloMute$.next({
                      changedSidecarAudioInputSoloMuteState: sidecarAudioInputSoloMuteState,
                      sidecarAudioInputSoloMuteStates: this.getSidecarAudioInputSoloMuteStates(),
                    });
                  },
                });

              sidecarAudio.onVolumeChange$
                .pipe(takeUntil(removed$)) // take until removed
                .pipe(takeUntil(this._destroyed$))
                .subscribe({
                  next: (event) => {
                    this.onSidecarAudioVolumeChange$.next({
                      sidecarAudioState: sidecarAudio.getSidecarAudioState(),
                      ...event,
                    });
                  },
                });

              if (this._config.audioPlayMode === 'single') {
                let settleMainAndSidecarAudio = () => {
                  if (sidecarAudio.getSidecarAudioState().active) {
                    // deactivate main audio
                    this.deactivateMainAudio();

                    // deactivate other sidecar audios
                    this.deactivateSidecarAudioTracks(
                      this.getSidecarAudios()
                        .filter((p) => p.audioTrack.id !== sidecarAudio.getSidecarAudioState().audioTrack.id)
                        .map((p) => p.audioTrack.id)
                    );
                  }
                };

                removed$.pipe(take(1)).subscribe({
                  next: (event) => {
                    // when active sidecar audio is removed, we have to activate main audio
                    if (event.sidecarAudioState.active) {
                      // activate main audio
                      this.activateMainAudio();
                    }
                  },
                });

                sidecarAudio.onStateChange$
                  .pipe(takeUntil(removed$)) // take until removed
                  .pipe(takeUntil(this._destroyed$))
                  .subscribe({
                    next: (sidecarAudioState) => {
                      settleMainAndSidecarAudio();
                    },
                  });

                settleMainAndSidecarAudio();
              }

              console.debug('Loaded sidecar audio', track);

              nextCompleteObserver(observer, sidecarAudio);
            },
            error: (error) => {
              console.error(error);

              this.onSidecarAudioLoaded$.error(error);

              this._removeSidecarAudio(sidecarAudioTrack.id);

              errorCompleteObserver(observer, `Error loading sidecar audio, track.src=${track.src}`);
            },
          });
      }
    });
  }

  protected _createSidecarAudios(tracks: OmpAudioTrackCreateType[]): Observable<SidecarAudioApi[]> {
    return new Observable<SidecarAudioApi[]>((observer) => {
      let observables = tracks.map((p) => this._createSidecarAudio(p));
      // ensures creation in order
      from(observables)
        .pipe(
          concatMap((p) => p),
          toArray()
        )
        .subscribe({
          next: (sidecarAudios) => {
            console.debug(
              'Loaded sidecar audios:',
              sidecarAudios.map((p) => p.getSidecarAudioState())
            );
            nextCompleteObserver(observer, sidecarAudios);
          },
          error: (err) => {
            console.debug(err);
            errorCompleteObserver(observer, 'Error creating sidecar audios');
          },
        });
    });
  }

  removeSidecarAudioTracks(ids: string[]): Observable<void> {
    return passiveObservable((observer) => {
      this._removeSidecarAudios(ids);
      nextCompleteObserver(observer);
    });
  }

  removeAllSidecarAudioTracks(): Observable<void> {
    return passiveObservable((observer) => {
      this._removeAllSidecarAudioTracks();
      nextCompleteObserver(observer);
    });
  }

  protected _removeSidecarAudios(ids: string[]) {
    let sidecarAudiosToRemove = ids.map((id) => (this._sidecarAudios.has(id) ? id : void 0)).filter(isNonNullable);

    if (sidecarAudiosToRemove.length > 0) {
      sidecarAudiosToRemove.forEach((id) => {
        this._removeSidecarAudio(id);
      });
    }
  }

  protected _removeAllSidecarAudioTracks() {
    this._removeSidecarAudios(this.getSidecarAudioTracks().map((p) => p.id));
  }

  protected _removeSidecarAudio(id: string) {
    let sidecarAudio = this._sidecarAudios.get(id)!;

    if (sidecarAudio) {
      console.debug('Removing sidecar audio', sidecarAudio.getSidecarAudioState());

      let sidecarAudioState = sidecarAudio.getSidecarAudioState();
      sidecarAudio.destroy();

      this._sidecarAudios.delete(id);
      this.onSidecarAudioRemove$.next({
        sidecarAudioState: sidecarAudioState,
      });
    }
  }

  getSidecarAudioTracks(): OmpAudioTrack[] {
    return [...this._sidecarAudios.values()].map((p) => p.audioTrack);
  }

  getActiveSidecarAudioTracks(): OmpAudioTrack[] {
    return this.getSidecarAudioTracks().filter((p) => p.active);
  }

  activateSidecarAudioTracks(ids: string[] | undefined, deactivateOthers?: boolean | undefined): Observable<void> {
    return passiveObservable((observer) => {
      let newActiveSidecarAudioTracks = this.getSidecarAudioTracks().filter((p) => !p.active && (ids === void 0 ? true : !!ids.find((id) => id === p.id)));
      let newInactiveSidecarAudioTracks = deactivateOthers ? this.getActiveSidecarAudioTracks().filter((p) => newActiveSidecarAudioTracks.find((p2) => p !== p2)) : [];

      if (newActiveSidecarAudioTracks.length > 0 || newInactiveSidecarAudioTracks.length > 0) {
        this._activateSidecarAudioTracks(newActiveSidecarAudioTracks.map((p) => p.id));
        this._deactivateSidecarAudioTracks(newInactiveSidecarAudioTracks.map((p) => p.id));
      }

      nextCompleteObserver(observer);
    });
  }

  deactivateSidecarAudioTracks(ids?: string[]): Observable<void> {
    return passiveObservable((observer) => {
      this._deactivateSidecarAudioTracks(ids === void 0 ? this.getSidecarAudioTracks().map((p) => p.id) : ids);
      nextCompleteObserver(observer);
    });
  }

  setSidecarVolume(volume: number, ids: string[] | undefined): Observable<void> {
    return passiveObservable((observer) => {
      let sidecarAudioTracks = this.getSidecarAudios().filter((p) => (ids === void 0 ? true : !!ids.find((id) => id === p.audioTrack.id)));
      sidecarAudioTracks.forEach((sidecarAudioTrack) => {
        sidecarAudioTrack.setVolume(volume);
      });
      nextCompleteObserver(observer);
    });
  }

  setSidecarMuted(muted: boolean, ids: string[] | undefined): Observable<void> {
    return passiveObservable((observer) => {
      let sidecarAudioTracks = this.getSidecarAudios().filter((p) => (ids === void 0 ? true : !!ids.find((id) => id === p.audioTrack.id)));
      sidecarAudioTracks.forEach((sidecarAudioTrack) => {
        sidecarAudioTrack.setMuted(muted);
      });
      nextCompleteObserver(observer);
    });
  }

  muteSidecar(ids: string[] | undefined): Observable<void> {
    return passiveObservable((observer) => {
      let sidecarAudioTracks = this.getSidecarAudios().filter((p) => (ids === void 0 ? true : !!ids.find((id) => id === p.audioTrack.id)));
      sidecarAudioTracks.forEach((sidecarAudioTrack) => {
        sidecarAudioTrack.mute();
      });
      nextCompleteObserver(observer);
    });
  }

  unmuteSidecar(ids: string[] | undefined): Observable<void> {
    return passiveObservable((observer) => {
      let sidecarAudioTracks = this.getSidecarAudios().filter((p) => (ids === void 0 ? true : !!ids.find((id) => id === p.audioTrack.id)));
      sidecarAudioTracks.forEach((sidecarAudioTrack) => {
        sidecarAudioTrack.unmute();
      });
      nextCompleteObserver(observer);
    });
  }

  createSidecarAudioRouter(sidecarAudioTrackId: string, inputsNumber?: number, outputsNumber?: number): Observable<OmpAudioRouterState> {
    return passiveObservable((observer) => {
      let sidecarAudio = this._sidecarAudios.get(sidecarAudioTrackId);
      if (sidecarAudio) {
        let audioRouter = sidecarAudio.createAudioRouter(inputsNumber, outputsNumber);
        nextCompleteObserver(observer, audioRouter.getAudioRouterState());
      } else {
        errorCompleteObserver(observer, 'Sidecar audio not found');
      }
    });
  }

  // createSidecarAudioRouterWithOutputsResolver(sidecarAudioTrackId: string, inputsNumber: number, outputsNumberResolver: (maxChannelCount: number) => number): Observable<OmpAudioRouterState> {}

  updateSidecarAudioRouterConnections(sidecarAudioTrackId: string, connections: OmpAudioRoutingConnection[]): Observable<void> {
    return passiveObservable((observer) => {
      let sidecarAudio = this._sidecarAudios.get(sidecarAudioTrackId);
      if (sidecarAudio && sidecarAudio.audioRouter) {
        sidecarAudio.audioRouter.updateConnections(connections);
        nextCompleteObserver(observer);
      } else {
        errorCompleteObserver(observer, 'Sidecar audio or sidecar audio router not found');
      }
    });
  }

  setSidecarAudioEffectsGraph(sidecarAudioTrackId: string, effectsGraphDef: OmpAudioEffectsGraphDef, effectsGraphConnection: OmpAudioEffectsGraphConnection): Observable<void> {
    if (effectsGraphConnection.slot === 'router') {
      return passiveObservable((observer) => {
        let sidecarAudio = this._sidecarAudios.get(sidecarAudioTrackId);
        if (sidecarAudio && sidecarAudio.audioRouter) {
          sidecarAudio.audioRouter.setAudioEffectsGraphs(effectsGraphDef, effectsGraphConnection.routingPath).subscribe(() => nextCompleteObserver(observer));
        } else {
          errorCompleteObserver(observer, 'Sidecar audio or sidecar audio router not found');
        }
      });
    } else if (effectsGraphConnection.slot === 'source' || effectsGraphConnection.slot === 'destination') {
      return passiveObservable((observer) => {
        let sidecarAudio = this._sidecarAudios.get(sidecarAudioTrackId);
        if (sidecarAudio) {
          sidecarAudio.removeEffectsGraph(effectsGraphConnection);
          sidecarAudio.setEffectsGraph(effectsGraphDef, effectsGraphConnection).subscribe(() => nextCompleteObserver(observer));
        } else {
          errorCompleteObserver(observer, 'Sidecar audio or sidecar audio router not found');
        }
      });
    } else {
      return passiveObservable((observer) => errorCompleteObserver(observer, 'Slot not supported.'));
    }
  }

  removeSidecarAudioEffectsGraphs(sidecarAudioTrackId: string, effectsGraphConnection: OmpAudioEffectsGraphConnection): Observable<void> {
    if (effectsGraphConnection.slot === 'router') {
      return passiveObservable((observer) => {
        let sidecarAudio = this._sidecarAudios.get(sidecarAudioTrackId);
        if (sidecarAudio && sidecarAudio.audioRouter) {
          sidecarAudio.audioRouter.removeAudioEffectsGraphs(effectsGraphConnection.routingPath);
          nextCompleteObserver(observer);
        } else {
          errorCompleteObserver(observer, 'Sidecar audio or sidecar audio router not found');
        }
      });
    } else if (effectsGraphConnection.slot === 'source' || effectsGraphConnection.slot === 'destination') {
      return passiveObservable((observer) => {
        let sidecarAudio = this._sidecarAudios.get(sidecarAudioTrackId);
        if (sidecarAudio) {
          sidecarAudio.removeEffectsGraph(effectsGraphConnection);
          nextCompleteObserver(observer);
        } else {
          errorCompleteObserver(observer, 'Sidecar audio or sidecar audio router not found');
        }
      });
    } else {
      return passiveObservable((observer) => errorCompleteObserver(observer, 'Slot not supported.'));
    }
  }

  setSidecarAudioEffectsParams(sidecarAudioTrackId: string, param: OmpAudioEffectParam, effectGraphConnection: OmpAudioEffectsGraphConnection, filter?: OmpAudioEffectFilter): Observable<void> {
    if (effectGraphConnection.slot === 'router') {
      return passiveObservable((observer) => {
        let sidecarAudio = this._sidecarAudios.get(sidecarAudioTrackId);
        if (sidecarAudio && sidecarAudio.audioRouter) {
          sidecarAudio.audioRouter.setAudioEffectsParams(param, {...filter, routingPath: effectGraphConnection.routingPath});
          nextCompleteObserver(observer);
        } else {
          errorCompleteObserver(observer, 'Sidecar audio or sidecar audio router not found');
        }
      });
    } else if (effectGraphConnection.slot === 'source') {
      return passiveObservable((observer) => {
        let sidecarAudio = this._sidecarAudios.get(sidecarAudioTrackId);
        if (sidecarAudio) {
          sidecarAudio.setAudioEffectsParams(param, effectGraphConnection, filter);
          nextCompleteObserver(observer);
        } else {
          errorCompleteObserver(observer, 'Sidecar audio not found');
        }
      });
    } else {
      return passiveObservable((observer) => errorCompleteObserver(observer, 'Slot not supported.'));
    }
  }

  createSidecarAudioPeakProcessor(sidecarAudioTrackId: string, audioMeterStandard?: AudioMeterStandard): Observable<Observable<AudioPeakProcessorMessageEvent>> {
    return passiveObservable((observer) => {
      let sidecarAudio = this._sidecarAudios.get(sidecarAudioTrackId);
      if (sidecarAudio) {
        sidecarAudio.createAudioPeakProcessor(audioMeterStandard).subscribe({
          next: (audioPeakProcessor) => {
            let removed$ = this.onSidecarAudioRemove$.pipe(filter((p) => p.sidecarAudioState.audioTrack.id === sidecarAudio!.audioTrack.id));
            audioPeakProcessor.onMessage$
              .pipe(takeUntil(removed$))
              .pipe(takeUntil(this._destroyed$))
              .subscribe({
                next: (event) => {
                  this.onSidecarAudioPeakProcessorMessage$.next({
                    sidecarAudioTrackId: sidecarAudio!.audioTrack.id,
                    data: event.data,
                  });
                },
              });
            nextCompleteObserver(observer, this.onSidecarAudioPeakProcessorMessage$.pipe(filter((p) => p.sidecarAudioTrackId === sidecarAudioTrackId)));
          },
        });
      } else {
        errorCompleteObserver(observer, 'Sidecar audio not found');
      }
    });
  }

  protected _activateSidecarAudioTracks(ids: string[]) {
    let sidecarAudios = this.getSidecarAudios().filter((p) => !!ids.find((id) => id === p.audioTrack.id));

    console.debug(`Activate sidecar audio tracks`, sidecarAudios);

    if (sidecarAudios.length > 0) {
      sidecarAudios.forEach((p) => p.activate());
    }
  }

  protected _deactivateSidecarAudioTracks(ids: string[]) {
    let sidecarAudios = this.getSidecarAudios().filter((p) => !!ids.find((id) => id === p.audioTrack.id));
    if (sidecarAudios.length > 0) {
      console.debug(`Deactivate sidecar audio tracks`, sidecarAudios);
      sidecarAudios.forEach((p) => p.deactivate());
    }
  }

  exportMainAudioTracksToSidecar(mainAudioTrackIds: string[]): Observable<OmpAudioTrack[]> {
    return passiveObservable((observer) => {
      let observables = mainAudioTrackIds.map((p) => this._exportMainAudioTrackToSidecar(p));
      from(observables)
        .pipe(
          concatMap((p) => p),
          toArray()
        )
        .subscribe({
          next: (result) => {
            nextCompleteObserver(observer, result);
          },
          error: (err) => {
            console.debug(err);
            errorCompleteObserver(observer, 'Error exporting sidecar audio tracks');
          },
        });
    });
  }

  exportMainAudioTrackToSidecar(mainAudioTrackId: string): Observable<OmpAudioTrack> {
    return passiveObservable((observer) => {
      this._exportMainAudioTrackToSidecar(mainAudioTrackId).subscribe({
        next: (event) => {
          nextCompleteObserver(observer, event);
        },
        error: (err) => {
          console.debug(err);
          errorCompleteObserver(observer, 'Error exporting sidecar audio track');
        },
      });
    });
  }

  _exportMainAudioTrackToSidecar(mainAudioTrackId: string): Observable<OmpAudioTrack> {
    return new Observable((observer) => {
      if (!this.isVideoLoaded()) {
        errorCompleteObserver(observer, new OmpError('Video not loaded'));
      } else {
        this._videoLoader!.exportAudioTrack(mainAudioTrackId).subscribe({
          next: (newAudioTrack) => {
            this._createSidecarAudioTrack({
              ...newAudioTrack,
              id: void 0,
            }).subscribe({
              next: (newAudioTrack) => {
                nextCompleteObserver(observer, newAudioTrack);
              },
              error: (error) => {
                errorCompleteObserver(observer, error);
              },
            });
          },
          error: (error) => {
            errorCompleteObserver(observer, error);
          },
        });
      }
    });
  }

  toggleSidecarAudioRouterSolo(sidecarAudioTrackId: string, routingPath: OmpAudioRoutingInputType): Observable<void> {
    return passiveObservable((observer) => {
      let sidecarAudio = this._sidecarAudios.get(sidecarAudioTrackId);
      if (sidecarAudio && sidecarAudio.audioRouter) {
        sidecarAudio.audioRouter.toggleSolo(routingPath);
        nextCompleteObserver(observer);
      } else {
        errorCompleteObserver(observer, 'Sidecar audio or sidecar audio router not found');
      }
    });
  }

  toggleSidecarAudioRouterMute(sidecarAudioTrackId: string, routingPath: OmpAudioRoutingInputType): Observable<void> {
    return passiveObservable((observer) => {
      let sidecarAudio = this._sidecarAudios.get(sidecarAudioTrackId);
      if (sidecarAudio && sidecarAudio.audioRouter) {
        sidecarAudio.audioRouter.toggleMute(routingPath);
        nextCompleteObserver(observer);
      } else {
        errorCompleteObserver(observer, 'Sidecar audio or sidecar audio router not found');
      }
    });
  }

  registerAudioEffect(effectType: string, effectFactory: OmpAudioEffectFactory) {
    const effectsRegistry = OmpAudioEffectsRegistry.instance;
    effectsRegistry.register(effectType, effectFactory);
  }

  destroy() {
    this.destroyAudioContext();

    if (this._mainAudioRouter) {
      this._mainAudioRouter.destroy();
    }

    this._removeAllSidecarAudioTracks();

    this.removeAllSubtitlesTracks();

    nextCompleteSubject(this._videoEventBreaker$);
    nextCompleteSubject(this._seekBreaker$);
    completeSubjects(this._videoFrameCallback$);

    completeUnsubscribeSubjects(
      this.onVideoLoaded$,
      this.onVideoLoading$,
      this.onPlay$,
      this.onPause$,
      this.onVideoTimeChange$,
      this.onSeeking$,
      this.onSeeked$,
      this.onBuffering$,
      this.onEnded$,
      this.onVideoError$,
      this.onVolumeChange$,
      this.onFullscreenChange$,
      this.onVideoSafeZoneChange$,
      this.onVideoWindowPlaybackStateChange$,

      this.onAudioLoaded$,
      this.onAudioSwitched$,

      this.onHelpMenuChange$,
      this.onPlaybackState$,
      this.onPlaybackRateChange$,

      this.onSubtitlesLoaded$,
      this.onSubtitlesCreate$,
      this.onSubtitlesRemove$,
      this.onSubtitlesShow$,
      this.onSubtitlesHide$,

      this.onActiveNamedEventStreamsChange$,
      this.onNamedEvent$
    );

    destroyer(this._videoLoader);

    nextCompleteSubject(this._destroyed$);

    nullifier(
      this._videoDomController,
      this._mediaElementPlayback,
      this._helpMenuGroups,
      this._video,

      this._activeSubtitlesTrack,
      this._subtitlesTracks
    );
  }
}
