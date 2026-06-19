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
  AudioFile,
  AudioType,
  type OutputTextFileFormatType,
  Relation,
  RelationType,
  type SlewOptions,
  type TextTrack,
  type TextTrackArgs,
  type TextTrackConversionOptions,
  TextTrackFile,
  type TextTrackLoadOptions,
  TextTrackType,
  type TimedItemsTrack,
  type Track,
  TrackType,
} from '../media';
import {from, map, Observable, of, ReplaySubject, switchMap, tap, throwError} from 'rxjs';
import {TrackRepository} from '../repository';
import {HlsAudio, HlsTextTrack} from '../hls';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {M3u8File} from '../m3u8/m3u8-file';
import {AuthConfig, FileFormat, FileFormatType} from '../common';
import {isNullOrUndefined, isString} from '../util/util-functions';
import {UrlUtil} from '../util/url-util';
import {type Source, SourceType, SourceUtil, TrackSource, UrlSource} from '../source';
import {httpGetArrayBuffer, httpGetText} from '../http';
import {BlobUtil} from '../util/blob-util';
import {StringUtil} from '../util/string-util';
import {AudioUtil} from '../audio/audio-util';
import {M3u8Util} from '../m3u8/m3u8-util';
import {CryptoUtil} from '../util/crypto-util';
import {TimedItemsFetcherFactory} from './timed-items-fetcher';

import type {TrackLoadOptions} from './track-load-options';
import type {OmakaseToolsApi} from '../tools';
import {MediaFactory} from '../media/media-factory';
import type {Destroyable} from '../common/capabilities';
import {convert} from 'subtitle-converter';
import {
  convert as ttconvConvert,
  type InputFormat,
  type OutputFormat,
  slew,
  type SlewFormat
} from '@byomakase/omakase-ttconv-ts';
import {OmakaseTools} from '../tools/omakase-tools-api';
import {isEmptyObject} from '../util/object-util';
import {type DownsampleOptions, TimedItemsDownsamplerFactory} from './timed-items-downsampler';

interface AudioFileCreateArgs {
  hlsAudio: HlsAudio;
  m3u8File: M3u8File;
}

export interface TrackUtilsApi extends Destroyable {
  /**
   * Preloads a track by resolving its segments into a self-contained, locally accessible form.
   *
   * For HLS audio tracks, segments are fetched and merged into a single blob URL.
   * For HLS text tracks, VTT segments are concatenated and exposed as a blob URL.
   * The resulting track is registered in the repository with a `DERIVED_FROM` relation
   * pointing to the original track.
   *
   * @param id - The ID of the track to preload.
   * @returns An Observable that emits the newly created derived {@link Track} once preloading is complete.
   */
  preloadTrack(id: Track['id']): Observable<Track>;

  /**
   * Downsamples a timed-items track and registers the result as a new derived track in the repository.
   *
   * The downsampled track has a `DERIVED_FROM` relation pointing to the source track.
   *
   * @param id - The ID of the source {@link TimedItemsTrack} to downsample.
   * @param options - Downsampling options (period and strategy).
   * @returns An Observable that emits the newly created downsampled {@link Track} once complete.
   */
  downsampleTrack(id: Track['id'], options: DownsampleOptions): Observable<Track>;

  /**
   * Fetches and populates timed items for the given track.
   *
   * Concurrent calls for the same track ID are deduplicated — subsequent subscribers
   * receive the result of the in-flight request rather than starting a new one.
   *
   * @param id - The ID of the track whose timed items should be fetched.
   * @returns An Observable that completes once the timed items have been loaded.
   */
  fetchTimedItems(id: Track['id']): Observable<void>;

  /**
   * Converts a text track to a different subtitle format, optionally applying time slewing.
   *
   * Accepts either a {@link Source} or a plain URL string pointing to the source subtitle file.
   * The converted track is registered in the repository with a `DERIVED_FROM` relation
   * pointing to the source track.
   *
   * @param source - A {@link Source} or URL string of the subtitle file to convert.
   * @param conversionOptions - Target format and optional slew configuration.
   * @param loadOptions - Optional load-time overrides (track type, file format, etc.).
   * @returns An Observable that emits the newly created converted {@link Track} once complete.
   */
  convertTextTrack(source: Source, conversionOptions: TextTrackConversionOptions, loadOptions?: TextTrackLoadOptions): Observable<Track>;
  convertTextTrack(url: string, conversionOptions: TextTrackConversionOptions, loadOptions?: TextTrackLoadOptions): Observable<Track>;
}

export class TrackUtils implements TrackUtilsApi {
  protected readonly _tools: OmakaseToolsApi = OmakaseTools.instance;
  protected readonly _trackRepository: TrackRepository;
  protected _tracksWithRequestedTimedItems = new Map<string, Observable<void>>();

  constructor(trackRepository: TrackRepository) {
    this._trackRepository = trackRepository;
  }

  preloadTrack(id: Track['id']): Observable<Track> {
    return passiveObservable<Track>((observer) => {
      let track: Track = this._trackRepository.getOrFail(id);

      // console.debug(`Preloading track`, track.state);

      let createNewTrack$: Observable<Track> | undefined;

      switch (track.trackType) {
        case TrackType.AUDIO:
          switch ((track as Audio).audioType) {
            case AudioType.HLS_AUDIO:
              createNewTrack$ = this.createAudioFile(track as HlsAudio);
              break;
          }
          break;
        case TrackType.TEXT_TRACK:
          switch ((track as TextTrack).textTrackType) {
            case TextTrackType.HLS_TEXT_TRACK:
              createNewTrack$ = this.createTextTrackFile(track as HlsTextTrack);
              break;
          }
          break;
      }

      if (createNewTrack$) {
        createNewTrack$
          .pipe(
            tap((newTrack) => {
              newTrack.addRelation(Relation.of(RelationType.DERIVED_FROM, track.id, track.mediaType));
              this._trackRepository.add(newTrack);
              newTrack.loadStart();
              newTrack.loadSuccess();
            })
          )
          .subscribe({
            next: (track) => {
              nextCompleteObserver(observer, track);
            },
            error: (err) => {
              errorCompleteObserver(observer, err);
            },
          });
      } else {
        errorCompleteObserver(observer, `Cannot preload track`);
      }
    });
  }

  convertTextTrack(source: Source, conversionOptions: TextTrackConversionOptions, loadOptions?: TextTrackLoadOptions): Observable<Track>;
  convertTextTrack(url: string, conversionOptions: TextTrackConversionOptions, loadOptions?: TextTrackLoadOptions): Observable<Track>;
  convertTextTrack(sourceOrUrl: Source | string, conversionOptions: TextTrackConversionOptions, loadOptions?: TextTrackLoadOptions): Observable<Track> {
    return passiveObservable<Track>((observer) => {
      let createTrack = (source: UrlSource): Observable<Track> => {
        return MediaFactory.createSidecarTrack(source, {...loadOptions, trackType: TrackType.TEXT_TRACK}).pipe(
          map((track) => {
            return this._trackRepository.add(track);
          })
        );
      };

      let track$: Observable<Track>;
      if (isString(sourceOrUrl)) {
        track$ = createTrack(UrlSource.of(sourceOrUrl));
      } else if (sourceOrUrl.type === SourceType.URL) {
        track$ = createTrack(sourceOrUrl as UrlSource);
      } else if (sourceOrUrl.type === SourceType.TRACK) {
        const existingTrack = this._trackRepository.getOrFail((sourceOrUrl as TrackSource).trackId);
        const trackType = existingTrack.trackType;
        if (trackType !== TrackType.TEXT_TRACK) {
          throw new Error(`Cannot convert ${trackType} track type`);
        }

        track$ = of(existingTrack);
      } else {
        throw new Error('Error converting text track');
      }

      track$
        .pipe(
          switchMap((track) => {
            if (isNullOrUndefined(conversionOptions) || isEmptyObject(conversionOptions)) {
              return of(track);
            }
            return this.convertTextTrackFile(track as TextTrackFile, conversionOptions).pipe(
              map((newTrack) => {
                newTrack.addRelation(Relation.of(RelationType.DERIVED_FROM, track.id, track.mediaType));
                return this._trackRepository.add(newTrack);
              })
            );
          })
        )
        .subscribe({
          next: (newTrack) => {
            nextCompleteObserver(observer, newTrack);
          },
          error: (err) => {
            errorCompleteObserver(observer, err);
          },
        });
    });
  }

  protected createAudioFile(hlsAudio: HlsAudio): Observable<AudioFile> {
    return new Observable<AudioFile>((observer) => {
      if (!hlsAudio.url) {
        throw new Error(`HlsAudio.url not defined`);
      }

      let hlsMediaPlaylistRootUrl = hlsAudio.url.substring(0, hlsAudio.url.lastIndexOf('/'));

      M3u8File.create(hlsAudio.url, AuthConfig.authentication)
        .pipe(
          map(
            (m3u8File) =>
              ({
                hlsAudio: hlsAudio,
                m3u8File: m3u8File,
              }) as AudioFileCreateArgs
          )
        )
        .subscribe({
          next: (audioPackage: AudioFileCreateArgs) => {
            let firstSegment = audioPackage.m3u8File.manifest!.segments[0];
            if (isNullOrUndefined(firstSegment)) {
              throw new Error(`First segment not found`);
            } else {
              firstSegment = firstSegment!;
            }

            const firstSegmentAbsUrl = UrlUtil.absolutizeUrl(hlsMediaPlaylistRootUrl, firstSegment.uri);
            const isNonFragmented = audioPackage.m3u8File.manifest!.segments.every((segment) => UrlUtil.absolutizeUrl(hlsMediaPlaylistRootUrl, segment.uri) === firstSegmentAbsUrl);

            let createAndLoad = (source: UrlSource, sourceFileFormatType?: FileFormatType) => {
              return new AudioFile({
                source: source,
                relations: [],
                label: audioPackage.hlsAudio.label,
                sourceFileFormatType: sourceFileFormatType,
                url: source.url,
                duration: audioPackage.hlsAudio.duration,
                audioCodec: audioPackage.hlsAudio.audioCodec,
                channels: audioPackage.hlsAudio.channels,
              });
            };

            if (isNonFragmented) {
              from(httpGetArrayBuffer(firstSegmentAbsUrl, AuthConfig.createRequestInit(firstSegmentAbsUrl, AuthConfig.authentication)))
                .pipe(
                  switchMap((arrayBuffer) =>
                    this._tools.probe(firstSegmentAbsUrl).pipe(map((probeResult) => createAndLoad(new UrlSource(BlobUtil.createBlobURL([arrayBuffer])), probeResult?.fileFormat.type)))
                  )
                )
                .subscribe({
                  next: (audioFile) => {
                    nextCompleteObserver(observer, audioFile);
                  },
                  error: (error) => {
                    errorCompleteObserver(observer, error);
                  },
                });
            } else {
              let fragmentsAbsUrls = audioPackage.m3u8File.manifest!.segments.map((segment) => UrlUtil.absolutizeUrl(hlsMediaPlaylistRootUrl, segment.uri));

              const initSegmentUrl = StringUtil.isNonEmpty(firstSegment.map.uri) ? UrlUtil.absolutizeUrl(hlsMediaPlaylistRootUrl, firstSegment.map.uri) : undefined;

              fragmentsAbsUrls = initSegmentUrl ? [initSegmentUrl, ...fragmentsAbsUrls] : fragmentsAbsUrls;

              AudioUtil.fetchAndMergeAudioFiles(fragmentsAbsUrls, AuthConfig.authentication)
                .pipe(
                  switchMap((audioArrayBuffer) =>
                    this._tools.probe(firstSegmentAbsUrl).pipe(map((probeResult) => createAndLoad(new UrlSource(BlobUtil.createBlobURL([audioArrayBuffer])), probeResult?.fileFormat.type)))
                  )
                )
                .subscribe({
                  next: (audioFile) => {
                    nextCompleteObserver(observer, audioFile);
                  },
                  error: (error) => {
                    errorCompleteObserver(observer, error);
                  },
                });
            }
          },
        });
    });
  }

  protected createTextTrackFile(hlsTextTrack: HlsTextTrack): Observable<TextTrackFile> {
    return new Observable<TextTrackFile>((observer) => {
      if (!hlsTextTrack.mediaPlaylist.url) {
        throw new Error(`HlsTextTrack.mediaPlaylist.url not defined`);
      }

      M3u8Util.fetchVttSegmentedConcat(hlsTextTrack.mediaPlaylist.url, AuthConfig.authentication).subscribe((webvttText) => {
        if (!webvttText) {
          throw new Error(`Could not find VTT's`);
        }

        CryptoUtil.digest(webvttText).subscribe((digest) => {
          let source = new UrlSource(BlobUtil.createBlobURL([webvttText], {type: 'text/vtt'}));
          let hlsTextTrackState = hlsTextTrack.state;
          let textTrackFile = new TextTrackFile({
            source: source,
            sourceFileFormatType: FileFormatType.VTT,
            relations: [],
            label: hlsTextTrackState.label,
            kind: hlsTextTrackState.kind,
            default: hlsTextTrackState.default,
            srclang: hlsTextTrackState.srclang,
          });

          nextCompleteObserver(observer, textTrackFile);
        });
      });
    });
  }

  fetchTimedItems(id: Track['id'], loadOptions?: TrackLoadOptions | undefined): Observable<void> {
    if (this._tracksWithRequestedTimedItems.has(id)) {
      const o$ = this._tracksWithRequestedTimedItems.get(id)!;
      return passiveObservable((observer) => {
        o$.subscribe({
          next: () => {
            nextCompleteObserver(observer);
          },
          error: (err) => {
            errorCompleteObserver(observer, err);
          },
        });
      });
    } else {
      let track = this._trackRepository.getOrFail(id);
      const o$ = new ReplaySubject<void>(1);
      this._tracksWithRequestedTimedItems.set(id, o$);
      return passiveObservable((observer) => {
        const timedItemsFetcher = TimedItemsFetcherFactory.createTimedItemsFetcher(track, loadOptions);
        timedItemsFetcher.fetchTimedItems().subscribe({
          next: () => {
            nextCompleteObserver(observer);
            this._tracksWithRequestedTimedItems.delete(id);
            o$.next();
            o$.complete();
          },
          error: (err) => {
            errorCompleteObserver(observer, err);
            this._tracksWithRequestedTimedItems.delete(id);
            o$.error(err);
          },
        });
      });
    }
  }

  downsampleTrack(id: Track['id'], options: DownsampleOptions): Observable<Track> {
    return passiveObservable<Track>((observer) => {
      const track = this._trackRepository.getOrFail(id) as TimedItemsTrack;
      const downsampler = TimedItemsDownsamplerFactory.create(track, options);
      const downsampledTrack = downsampler.downsampledTrack;
      downsampledTrack.addRelation(Relation.of(RelationType.DERIVED_FROM, track.id, track.mediaType));
      this._trackRepository.add(downsampledTrack);
      downsampledTrack.loadStart();
      downsampledTrack.loadSuccess();
      nextCompleteObserver(observer, downsampledTrack);
    });
  }

  protected convertTextTrackFile(textTrackFile: TextTrackFile, conversionOptions: TextTrackConversionOptions): Observable<Track> {
    return new Observable<Track>((observer) => {
      let textTrackFileSource = textTrackFile.source;
      if (!textTrackFileSource) {
        throw new Error('TextTrackFile.source not defined');
      } else if (textTrackFileSource.type === SourceType.TRACK) {
        throw new Error('Conversion not supported for SourceType.TRACK');
      }

      const createTrack = (data: ArrayBuffer | string, fileFormatType: FileFormatType): void => {
        let mimeType = FileFormat.TEXT.find((fileFormat) => fileFormat.type === fileFormatType)?.mimeTypes[0];
        let source = UrlSource.of(BlobUtil.createBlobURL([data], mimeType ? {type: mimeType} : void 0));
        let args: TextTrackArgs = {
          source: source,
          sourceFileFormatType: fileFormatType,
          relations: [],
          label: label ?? `Converted${textTrackFileState.label ? ` ${textTrackFileState.label}` : ``}`,
          kind: textTrackFileState.kind,
          default: false,
          srclang: textTrackFileState.srclang,
        };

        MediaFactory.createSidecarTrack(source, {trackType: TrackType.TEXT_TRACK, fileFormatType, args}).subscribe({
          next: (track) => {
            nextCompleteObserver(observer, track);
          },
          error: (err) => {
            errorCompleteObserver(observer, err);
          },
        });
      };

      const {label, outputFormat, slewOptions} = conversionOptions;
      const sourceUrl = SourceUtil.resolveUrlFromSource(textTrackFileSource);
      const textTrackFileState = textTrackFile.state;
      const sourceFileFormatType = textTrackFileState?.sourceFileFormatType;
      if (!sourceFileFormatType || !FileFormat.TEXT.some((format) => format.type === sourceFileFormatType)) {
        throw Error(`Unknown text fileFormatType: ${sourceFileFormatType}`);
      }

      let p: Promise<ArrayBuffer | string>;
      if (sourceFileFormatType === FileFormatType.STL) {
        p = httpGetArrayBuffer(sourceUrl, AuthConfig.createRequestInit(sourceUrl, AuthConfig.authentication));
      } else {
        p = httpGetText(sourceUrl, AuthConfig.createRequestInit(sourceUrl, AuthConfig.authentication));
      }

      from(p).subscribe({
        next: (data) => {
          if (outputFormat) {
            this.resolveConverter(data, sourceFileFormatType, outputFormat, slewOptions).subscribe({
              next: (convertedData) => {
                createTrack(convertedData, outputFormat);
              },
              error: (err) => {
                errorCompleteObserver(observer, err);
              },
            });
          } else if (slewOptions?.timeSlew) {
            createTrack(this.slewSubtitles(data as string, sourceFileFormatType, slewOptions), sourceFileFormatType);
          } else {
            createTrack(data, sourceFileFormatType);
          }
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  private resolveConverter(subtitlesData: ArrayBuffer | string, inputFileFormatType: FileFormatType, outputFileFormatType: OutputTextFileFormatType, slewOptions?: SlewOptions): Observable<string> {
    switch (inputFileFormatType) {
      case FileFormatType.SCC:
      case FileFormatType.VTT:
      case FileFormatType.SRT:
      case FileFormatType.TTML:
      case FileFormatType.STL:
        return this.convertWithTtconv(subtitlesData, inputFileFormatType, outputFileFormatType, slewOptions);
      case FileFormatType.SSA:
      case FileFormatType.ASS:
        return this.convertWithSubtitleConverter(subtitlesData as string, outputFileFormatType, slewOptions);
      default:
        return throwError(() => new Error(`Unknown text fileFormatType: ${inputFileFormatType}`));
    }
  }

  private slewSubtitles(subtitlesData: string, format: FileFormatType, slewOptions: SlewOptions): string {
    switch (format) {
      case FileFormatType.TTML:
      case FileFormatType.VTT:
      case FileFormatType.SRT:
      case FileFormatType.SSA:
      case FileFormatType.ASS:
        return slew(subtitlesData, format.toLowerCase() as SlewFormat, slewOptions);
      case FileFormatType.SCC:
      case FileFormatType.STL:
        throw new Error(`Can not slew ${format} fileFormatType. Convert to VTT | SRT | TTML to enable time slewing`);
      default:
        throw new Error(`Unknown text fileFormatType: ${format}`);
    }
  }

  private convertWithTtconv(subtitlesData: ArrayBuffer | string, inputFormat: FileFormatType, outputFormat: OutputTextFileFormatType, slewOptions?: SlewOptions): Observable<string> {
    return new Observable<string>((observer) => {
      const convertSubtitles = () => {
        let o$ = of(
          ttconvConvert(subtitlesData, inputFormat.toLowerCase() as InputFormat, outputFormat.toLowerCase() as OutputFormat, {
            writer: {styleRegion: true, textFormatting: true},
            slewOptions,
          })
        );

        o$.subscribe({
          next: (convertedData) => {
            nextCompleteObserver(observer, convertedData);
          },
          error: (err) => {
            errorCompleteObserver(observer, err);
          },
        });
      };

      switch (outputFormat) {
        case FileFormatType.VTT:
        case FileFormatType.SRT:
        case FileFormatType.TTML:
          convertSubtitles();
          break;
        default:
          errorCompleteObserver(observer, `Unknown outputFormat ${outputFormat}`);
          break;
      }
    });
  }

  private convertWithSubtitleConverter(subtitlesData: string, outputFormat: OutputTextFileFormatType, slewOptions?: SlewOptions): Observable<string> {
    return new Observable<string>((observer) => {
      const convertSubtitles = () => {
        try {
          const {subtitle, status} = convert(subtitlesData, `.${outputFormat.toLowerCase()}`, {
            removeTextFormatting: false,
          });

          if (status.success) {
            if (slewOptions?.timeSlew) {
              nextCompleteObserver(observer, this.slewSubtitles(subtitle, outputFormat, slewOptions));
            } else {
              nextCompleteObserver(observer, subtitle);
            }
          } else {
            errorCompleteObserver(observer, 'Could not convert text track');
          }
        } catch (e) {
          errorCompleteObserver(observer, e);
        }
      };

      switch (outputFormat) {
        case FileFormatType.VTT:
        case FileFormatType.SRT:
          convertSubtitles();
          break;
        case FileFormatType.TTML:
          errorCompleteObserver(observer, `Cannot convert SSA/ASS format to ${outputFormat} format`);
          break;
        default:
          errorCompleteObserver(observer, `Unknown outputFormat ${outputFormat}`);
          break;
      }
    });
  }

  destroy(): void {}
}
