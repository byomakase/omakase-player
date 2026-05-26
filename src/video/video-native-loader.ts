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

import {combineLatest, first, fromEvent, Observable, Subject, take, takeUntil} from 'rxjs';
import {NativeDrmConfig, NativeDrmFairplayConfig, NativeDrmWidevineConfig, Video, VideoLoadOptions} from './model';
import {BaseVideoLoader} from './video-loader';
import {errorCompleteObserver, nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {z} from 'zod';
import {VideoControllerApi} from './video-controller-api';
import {FrameRateUtil} from '../util/frame-rate-util';
import {OmpAudioTrack, OmpAudioTrackCreateType, OmpNamedEventEventName} from '../types';
import {FileUtil} from '../util/file-util';
import {CryptoUtil} from '../util/crypto-util';
import {AudioUtil} from '../util/audio-util';
import {BlobUtil} from '../util/blob-util';

import {HTMLVideoElementEvents} from '../media-element/omp-media-element';
import {AuthConfig} from '../common/authentication';
import {MediaMetadata, MediaMetadataResolver} from '../tools/media-metadata-resolver';
import {audioChannelsDefault} from '../constants';

export class VideoNativeLoader extends BaseVideoLoader {
  private static audioLabelDefault = 'Default';

  protected _audioTracks: Map<string, OmpAudioTrack> = new Map<string, OmpAudioTrack>();
  protected _activeAudioTrack: OmpAudioTrack | undefined;

  constructor(videoController: VideoControllerApi) {
    super(videoController);
    console.debug('video load with native');
  }

  override loadVideo(sourceUrl: string, options?: VideoLoadOptions | undefined): Observable<Video> {
    nextCompleteSubject(this._loadVideoBreaker$);
    this._loadVideoBreaker$ = new Subject<void>();

    return passiveObservable<Video>((observer) => {
      let videoElement = this._videoController.getHTMLVideoElement();

      videoElement.src = '';
      videoElement.load();

      let videoLoadedData$ = fromEvent(videoElement, HTMLVideoElementEvents.LOADEDDATA).pipe(first());
      let videoLoadedMetadata$ = fromEvent(videoElement, HTMLVideoElementEvents.LOADEDMETEDATA).pipe(first());
      let videoLoadError$ = fromEvent(videoElement, HTMLVideoElementEvents.ERROR).pipe(take(1));

      let mediaMetadata$ = new Subject<MediaMetadata>();

      let videoLoad$ = new Subject<{
        frameRate: number | undefined;
        initSegmentTimeOffset: number | undefined;
      }>();

      let audioLoad$ = new Subject<{
        channels: number;
      }>();

      let drmReady$ = new Subject<boolean>();

      combineLatest([videoLoadedData$, videoLoadedMetadata$, mediaMetadata$])
        .pipe(takeUntil(this._destroyed$))
        .pipe(take(1))
        .subscribe({
          next: ([videoLoadedData, videoLoadedMetadata, mediaMetadata]) => {
            nextCompleteSubject(videoLoad$, {
              frameRate: mediaMetadata.firstVideoTrackFrameRate,
              initSegmentTimeOffset: mediaMetadata.firstVideoTrackInitSegmentTime
            });
          },
        });

      combineLatest([videoLoad$, mediaMetadata$])
        .pipe(takeUntil(this._destroyed$))
        .pipe(take(1))
        .subscribe({
          next: ([videoLoadResult, mediaMetadata]) => {
            if (!mediaMetadata.firstAudioTrackChannelsNumber) {
              console.debug(`Could not resolve channels, setting default.`, audioChannelsDefault);
            }

            nextCompleteSubject(audioLoad$, {
              channels: mediaMetadata.firstAudioTrackChannelsNumber ? mediaMetadata.firstAudioTrackChannelsNumber : audioChannelsDefault,
            });
          },
        });

      MediaMetadataResolver.getMediaMetadata(sourceUrl, ['firstVideoTrackInitSegmentTime', 'firstVideoTrackFrameRate', 'firstAudioTrackChannelsNumber']).subscribe({
        next: (mediaMetadata: MediaMetadata) => {
          console.debug(`Media metadata`, mediaMetadata);
          nextCompleteSubject(mediaMetadata$, mediaMetadata);
        }
      })

      if (options?.drm) {
        this.setupEme(videoElement, options.drm, sourceUrl).then(
          () => {
            console.debug('EME setup complete, keys usable');
            nextCompleteSubject(drmReady$, true);
          },
          (error) => {
            console.error('EME setup failed', error);
            errorCompleteObserver(observer, error);
          }
        );
      } else {
        nextCompleteSubject(drmReady$, false);
      }

      combineLatest([videoLoad$, drmReady$])
        .pipe(takeUntil(this._destroyed$))
        .pipe(take(1))
        .subscribe(([ videoLoadEvent, isDrm]) => {
          let duration: number;
          if (options && options.duration !== void 0) {
            duration = z.coerce.number().parse(options.duration);
            duration = duration ? duration : videoElement.duration;
          } else {
            duration = videoElement.duration;
          }

          let isAudioOnly = FileUtil.isAudioFile(sourceUrl);

          const frameRate = options?.frameRate ? FrameRateUtil.resolveFrameRate(options.frameRate) : videoLoadEvent.frameRate;
          if (!frameRate) {
            throw new Error('Frame rate could not be determined');
          }

          let dropFrame = options && options.dropFrame !== void 0 ? options.dropFrame : FrameRateUtil.resolveDropFrameFromFramerate(frameRate);

          let video: Video = {
            protocol: 'native',
            sourceUrl: sourceUrl,
            frameRate: frameRate,
            dropFrame: dropFrame,
            duration: duration,
            totalFrames: FrameRateUtil.totalFramesNumber(duration, frameRate),
            frameDuration: FrameRateUtil.frameDuration(frameRate),
            audioOnly: isAudioOnly,
            drm: isDrm,
            initSegmentTimeOffset: videoLoadEvent.initSegmentTimeOffset,
          };

          nextCompleteObserver(observer, video);
        })
        .add(() => {
          nextCompleteSubject(this._loadVideoBreaker$);
        });

      videoLoadError$.pipe(takeUntil(this._destroyed$), takeUntil(this._loadVideoBreaker$)).subscribe((error) => {
        errorCompleteObserver(observer, error);
      });

      audioLoad$.subscribe((event) => {
        let audioTrack: OmpAudioTrack = {
          id: `${CryptoUtil.uuid()}`,
          src: sourceUrl,
          embedded: true,
          active: true,
          language: VideoNativeLoader.audioLabelDefault,
          label: VideoNativeLoader.audioLabelDefault,
          channelCount: event.channels,
        };

        this._audioTracks.set(audioTrack.id, audioTrack);
        this._activeAudioTrack = audioTrack;

        // assuming interleaved audio
        this.onAudioLoaded$.next({
          audioTracks: [...this._audioTracks.values()],
          activeAudioTrack: this._activeAudioTrack,
        });
      });

      audioLoad$.subscribe((event) => {
        // assuming no embedded subtitles
        this.onSubtitlesLoaded$.next({
          tracks: [],
          currentTrack: void 0,
        });
      });

      videoElement.src = sourceUrl;
      videoElement.load();
    });
  }

  private async setupEme(videoElement: HTMLVideoElement, drmConfig: NativeDrmConfig, sourceUrl: string): Promise<void> {
    const isFairplay = !!drmConfig.fairplay;
    const isWidevine = !!drmConfig.widevine;

    if (!isFairplay && !isWidevine) {
      throw new Error('NativeDrmConfig must specify either fairplay or widevine configuration');
    }

    if (isFairplay) {
      return this.setupFairplay(videoElement, drmConfig.fairplay!, sourceUrl);
    } else {
      return this.setupWidevine(videoElement, drmConfig.widevine!);
    }
  }

  private async setupFairplay(videoElement: HTMLVideoElement, config: NativeDrmFairplayConfig, sourceUrl: string): Promise<void> {
    const certResponse = await fetch(config.serverCertificateUrl);
    if (!certResponse.ok) {
      throw new Error(`Failed to fetch FairPlay server certificate: ${certResponse.status}`);
    }
    const serverCertificate = new Uint8Array(await certResponse.arrayBuffer());

    const keySystemConfig: MediaKeySystemConfiguration[] = [{
      initDataTypes: ['sinf', 'skd'],
      videoCapabilities: [{contentType: 'video/mp4'}],
      audioCapabilities: [{contentType: 'audio/mp4'}],
      distinctiveIdentifier: 'not-allowed' as MediaKeysRequirement,
      persistentState: 'not-allowed' as MediaKeysRequirement,
      sessionTypes: ['temporary'],
    }];

    const keySystemAccess = await navigator.requestMediaKeySystemAccess('com.apple.fps', keySystemConfig);
    const mediaKeys = await keySystemAccess.createMediaKeys();
    await mediaKeys.setServerCertificate(serverCertificate);
    await videoElement.setMediaKeys(mediaKeys);

    return new Promise<void>((resolve, reject) => {
      let resolved = false;

      const onEncrypted = async (event: Event) => {
        try {
          const encryptedEvent = event as MediaEncryptedEvent;
          const initData = encryptedEvent.initData;
          if (!initData) {
            throw new Error('No init data in encrypted event');
          }

          const session = mediaKeys.createSession();

          session.addEventListener('message', async (evt: Event) => {
            try {
              const messageEvent = evt as MediaKeyMessageEvent;
              const license = await this.fetchLicense(
                config.licenseUrl,
                messageEvent.message,
                config.licenseRequestHeaders
              );
              await session.update(license);
            } catch (err) {
              if (!resolved) {
                resolved = true;
                reject(err);
              }
            }
          });

          session.addEventListener('keystatuseschange', () => {
            session.keyStatuses.forEach((status: MediaKeyStatus) => {
              if (status === 'usable') {
                if (!resolved) {
                  resolved = true;
                  resolve();
                }
              }
            });
          });

          await session.generateRequest(encryptedEvent.initDataType || 'sinf', initData);
        } catch (err) {
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        }
      };

      videoElement.addEventListener('encrypted', onEncrypted, {once: true});
    });
  }

  private async setupWidevine(videoElement: HTMLVideoElement, config: NativeDrmWidevineConfig): Promise<void> {
    const keySystemConfig: MediaKeySystemConfiguration[] = [{
      initDataTypes: ['cenc'],
      videoCapabilities: [{contentType: 'video/mp4; codecs="avc1.42E01E"'}],
      audioCapabilities: [{contentType: 'audio/mp4; codecs="mp4a.40.2"'}],
      distinctiveIdentifier: 'optional' as MediaKeysRequirement,
      persistentState: 'optional' as MediaKeysRequirement,
      sessionTypes: ['temporary'],
    }];

    const keySystemAccess = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', keySystemConfig);
    const mediaKeys = await keySystemAccess.createMediaKeys();

    if (config.serverCertificateUrl) {
      const certResponse = await fetch(config.serverCertificateUrl);
      if (!certResponse.ok) {
        throw new Error(`Failed to fetch Widevine server certificate: ${certResponse.status}`);
      }
      const serverCertificate = new Uint8Array(await certResponse.arrayBuffer());
      await mediaKeys.setServerCertificate(serverCertificate);
    }

    await videoElement.setMediaKeys(mediaKeys);

    return new Promise<void>((resolve, reject) => {
      let resolved = false;

      const onEncrypted = async (event: Event) => {
        try {
          const encryptedEvent = event as MediaEncryptedEvent;
          const initData = encryptedEvent.initData;
          if (!initData) {
            throw new Error('No init data in encrypted event');
          }

          const session = mediaKeys.createSession();

          session.addEventListener('message', async (evt: Event) => {
            try {
              const messageEvent = evt as MediaKeyMessageEvent;
              const license = await this.fetchLicense(
                config.licenseUrl,
                messageEvent.message,
                config.licenseRequestHeaders
              );
              await session.update(license);
            } catch (err) {
              if (!resolved) {
                resolved = true;
                reject(err);
              }
            }
          });

          session.addEventListener('keystatuseschange', () => {
            session.keyStatuses.forEach((status: MediaKeyStatus) => {
              if (status === 'usable') {
                if (!resolved) {
                  resolved = true;
                  resolve();
                }
              }
            });
          });

          await session.generateRequest(encryptedEvent.initDataType || 'cenc', initData);
        } catch (err) {
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        }
      };

      videoElement.addEventListener('encrypted', onEncrypted, {once: true});
    });
  }

  private async fetchLicense(licenseUrl: string, message: ArrayBuffer, headers?: Record<string, string>): Promise<ArrayBuffer> {
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      ...headers,
    };

    const response = await fetch(licenseUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: message,
    });

    if (!response.ok) {
      throw new Error(`License request failed: ${response.status} ${response.statusText}`);
    }

    return response.arrayBuffer();
  }

  override setActiveAudioTrack(ompAudioTrackId: string): Observable<void> {
    return new Observable((observer) => {
      if (!this._audioTracks.has(ompAudioTrackId)) {
        throw new Error('Audio track not found');
      }
      console.debug('Audio track active by default');
      nextCompleteObserver(observer);
    });
  }

  override exportAudioTrack(ompAudioTrackId: string): Observable<OmpAudioTrackCreateType> {
    return new Observable((observer) => {
      if (!this._audioTracks.has(ompAudioTrackId)) {
        throw new Error('Audio track not found');
      } else {
        let audioTrack = this._audioTracks.get(ompAudioTrackId)!;

        AudioUtil.fetchAudioFile(audioTrack.src, AuthConfig.authentication).subscribe({
          next: (audioArrayBuffer) => {
            let audioTrack: OmpAudioTrackCreateType = {
              src: BlobUtil.createBlobURL([audioArrayBuffer]),
              language: VideoNativeLoader.audioLabelDefault,
              label: VideoNativeLoader.audioLabelDefault,
            };
            nextCompleteObserver(observer, audioTrack);
          },
          error: (error) => {
            errorCompleteObserver(observer, error);
          },
        });
      }
    });
  }

  updateActiveNamedEventStreams(eventNames: OmpNamedEventEventName[]): void {}

  override destroy() {
    super.destroy();
  }
}
