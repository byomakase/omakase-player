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
  AudioFile,
  type AudioTrackLoadOptions,
  type MainMedia,
  type MainMediaLoadOptions,
  MainMediaType,
  type MarkerTrackLoadOptions,
  ObservationTrackFile,
  type ObservationTrackLoadOptions,
  TextTrackFile,
  type TextTrackLoadOptions,
  type ThumbnailTrackLoadOptions,
  type Track,
  TrackType,
} from './index';
import {Validators} from '../common/validators';
import {HlsMainMedia} from '../hls';
import {type Source, UrlSource} from '../source';
import {Mp4MainMedia} from '../mp4';
import {AudioMainMedia} from '../audio/audio-file-main-media';
import {MarkerTrack} from './marker-track';
import {ThumbnailTrack} from './thumbnail-track';
import {OmakaseTools, type OmakaseToolsApi} from '../tools/omakase-tools-api';
import {catchError, map, Observable, of} from 'rxjs';
import {FileFormat, FileFormatType} from '../common';
import type {TrackLoadOptions} from '../track';

export class MediaFactory {
  protected static get _tools(): OmakaseToolsApi {
    return OmakaseTools.instance;
  }

  private static readonly MAIN_MEDIA_TYPE_FORMATS: Record<MainMediaType, readonly FileFormatType[]> = {
    [MainMediaType.HLS]: [FileFormatType.HLS],
    [MainMediaType.MP4]: [FileFormatType.MP4, FileFormatType.MOV],
    [MainMediaType.AUDIO_FILE]: [...FileFormat.AUDIO.map((p) => p.type)],
  };

  private static readonly TRACK_TYPE_FORMATS: Partial<Record<TrackType, readonly FileFormatType[]>> = {
    [TrackType.AUDIO]: [FileFormatType.MP4, ...FileFormat.AUDIO.map((p) => p.type)],
    [TrackType.TEXT_TRACK]: [...FileFormat.TEXT.map((p) => p.type)],
    [TrackType.MARKER_TRACK]: [FileFormatType.VTT],
    [TrackType.THUMBNAIL_TRACK]: [FileFormatType.VTT],
    [TrackType.OBSERVATION_TRACK]: [FileFormatType.VTT],
  };

  static createMainMedia(urlSource: UrlSource, loadOptions?: MainMediaLoadOptions | undefined): Observable<MainMedia> {
    return this.resolveMainMediaType(urlSource, loadOptions).pipe(
      map(({mainMediaType, fileFormat}) => {
        const sourceFileFormatType = fileFormat.type;
        switch (mainMediaType) {
          case MainMediaType.HLS:
            return new HlsMainMedia({source: urlSource, sourceFileFormatType, loadOptions});
          case MainMediaType.MP4:
            return new Mp4MainMedia({
              source: urlSource,
              sourceFileFormatType,
              loadOptions,
            });
          case MainMediaType.AUDIO_FILE:
            return new AudioMainMedia({source: urlSource, sourceFileFormatType, loadOptions});
        }
      })
    );
  }

  static resolveMainMediaType(urlSource: UrlSource, loadOptions?: MainMediaLoadOptions | undefined): Observable<{mainMediaType: MainMediaType; fileFormat: FileFormat}> {
    const fileFormatType = loadOptions?.fileFormatType;
    const fileFormat = fileFormatType ? FileFormat.fromType(fileFormatType) : undefined;
    if (fileFormatType && !fileFormat) {
      throw new Error(`Cannot resolve fileFormat from fileFormatType: ${fileFormatType}`);
    }
    const mainMediaType = loadOptions?.mainMediaType;

    // Validate fileFormat against mainMediaType if both are known
    if (fileFormat && mainMediaType && !this.MAIN_MEDIA_TYPE_FORMATS[mainMediaType].includes(fileFormat.type)) {
      throw new Error(`fileFormatType ${fileFormatType} is not compatible with mainMediaType ${mainMediaType}`);
    }

    // fileFormat known — derive mainMediaType if needed, no probe required
    if (fileFormat) {
      const resolvedMainMediaType = mainMediaType ?? this.mainMediaTypeFromFileFormat(fileFormat);
      if (!resolvedMainMediaType) {
        throw new Error(`Cannot resolve mainMediaType from fileFormatType: ${fileFormatType}`);
      }
      return of({mainMediaType: resolvedMainMediaType, fileFormat});
    }

    // probe to resolve fileFormat
    return this._tools.probe(urlSource.url).pipe(
      map((mediaProbeResult) => {
        const probedFileFormat = mediaProbeResult?.fileFormat;
        if (!probedFileFormat) {
          throw new Error(`Cannot resolve fileFormat for: ${JSON.stringify(urlSource.state)}`);
        }
        const probedMainMediaType = this.mainMediaTypeFromFileFormat(probedFileFormat);
        if (mainMediaType) {
          if (!this.MAIN_MEDIA_TYPE_FORMATS[mainMediaType].includes(probedFileFormat.type)) {
            throw new Error(`mainMediaType ${mainMediaType} is not compatible with probed fileFormat ${probedFileFormat.type}`);
          }
          if (probedMainMediaType !== mainMediaType) {
            throw new Error(`probed fileFormat ${probedFileFormat.type} is not compatible with mainMediaType ${mainMediaType}`);
          }
        }
        const resolvedMainMediaType = mainMediaType ?? probedMainMediaType;
        if (!resolvedMainMediaType) {
          throw new Error(`Cannot resolve mainMediaType for: ${JSON.stringify(urlSource.state)}`);
        }
        return {mainMediaType: resolvedMainMediaType, fileFormat: probedFileFormat};
      })
    );
  }

  private static mainMediaTypeFromFileFormat(fileFormat: FileFormat | undefined): MainMediaType | undefined {
    if (!fileFormat) {
      return undefined;
    }
    return (Object.entries(this.MAIN_MEDIA_TYPE_FORMATS) as [MainMediaType, readonly FileFormatType[]][]).find(([, formats]) => formats.includes(fileFormat.type))?.[0];
  }

  static createSidecarTrack(urlSource: UrlSource, loadOptions?: TrackLoadOptions | undefined): Observable<Track> {
    return this.resolveTrackType(urlSource, loadOptions).pipe(
      map(({trackType, fileFormat}) => {
        const sourceFileFormatType = fileFormat?.type;
        switch (trackType) {
          case TrackType.AUDIO:
            return new AudioFile({
              source: urlSource,
              sourceFileFormatType,
              ...(loadOptions as AudioTrackLoadOptions | undefined)?.args,
            });
          case TrackType.TEXT_TRACK:
            return new TextTrackFile({
              source: urlSource,
              sourceFileFormatType,
              ...(loadOptions as TextTrackLoadOptions | undefined)?.args,
            });
          default:
            throw new Error('niy');
        }
      })
    );
  }

  private static resolveTrackType(urlSource?: UrlSource, loadOptions?: TrackLoadOptions | undefined): Observable<{trackType: TrackType; fileFormat: FileFormat | undefined}> {
    const fileFormatType = loadOptions?.fileFormatType;
    const fileFormat = fileFormatType ? FileFormat.fromType(fileFormatType) : undefined;
    if (fileFormatType && !fileFormat) {
      throw new Error(`Cannot resolve fileFormat from fileFormatType: ${fileFormatType}`);
    }
    const trackType = loadOptions?.trackType;
    if (trackType) {
      Validators.trackType()(trackType);
    }

    // trackType provided and has no file format concept — resolve immediately
    if (trackType && !this.TRACK_TYPE_FORMATS[trackType]) {
      return of({trackType, fileFormat: undefined});
    }

    // Validate fileFormat against trackType if both known
    if (fileFormat && trackType) {
      const allowed = this.TRACK_TYPE_FORMATS[trackType];
      if (!allowed?.includes(fileFormat.type)) {
        throw new Error(`fileFormatType ${fileFormatType} is not compatible with trackType ${trackType}`);
      }
    }

    // fileFormat known — derive trackType if needed, no probe required
    if (fileFormat) {
      const resolvedTrackType = trackType ?? this.trackTypeFromFileFormat(fileFormat);
      if (!resolvedTrackType) {
        throw new Error(`Cannot resolve trackType from fileFormatType: ${fileFormatType}`);
      }
      return of({trackType: resolvedTrackType, fileFormat});
    }

    // probe to resolve fileFormat
    if (!urlSource) {
      throw new Error(`Cannot resolve fileFormat: urlSource is required when fileFormatType is not provided`);
    }
    return this._tools.probe(urlSource.url).pipe(
      map((mediaProbeResult) => {
        const probedFileFormat = mediaProbeResult?.fileFormat;
        if (!probedFileFormat) {
          throw new Error(`Cannot resolve fileFormat for: ${JSON.stringify(urlSource?.state)}`);
        }
        const probedTrackType = this.trackTypeFromFileFormat(probedFileFormat);
        if (trackType) {
          const allowed = this.TRACK_TYPE_FORMATS[trackType];
          if (!allowed?.includes(probedFileFormat.type)) {
            throw new Error(`trackType ${trackType} is not compatible with probed fileFormat ${probedFileFormat.type}`);
          }
        }
        const resolvedTrackType = trackType ?? probedTrackType;
        if (!resolvedTrackType) {
          throw new Error(`Cannot resolve trackType for: ${JSON.stringify(urlSource?.state)}`);
        }
        return {trackType: resolvedTrackType, fileFormat: probedFileFormat};
      })
    );
  }

  private static trackTypeFromFileFormat(fileFormat: FileFormat | undefined): TrackType | undefined {
    if (!fileFormat) {
      return undefined;
    }
    return (Object.entries(this.TRACK_TYPE_FORMATS) as [TrackType, readonly FileFormatType[]][]).find(([, formats]) => formats.includes(fileFormat.type))?.[0];
  }

  static createTrack(source: Source, loadOptions?: TrackLoadOptions | undefined): Observable<Track> {
    const urlSource = source instanceof UrlSource ? source : undefined;
    return this.resolveTrackType(urlSource, loadOptions).pipe(
      map(({trackType, fileFormat}) => {
        const sourceFileFormatType = fileFormat?.type;
        switch (trackType) {
          case TrackType.MARKER_TRACK:
            return new MarkerTrack({
              source,
              sourceFileFormatType,
              ...(loadOptions as MarkerTrackLoadOptions | undefined),
            });
          case TrackType.THUMBNAIL_TRACK:
            return new ThumbnailTrack({
              source,
              sourceFileFormatType,
              ...(loadOptions as ThumbnailTrackLoadOptions | undefined),
            });
          case TrackType.TEXT_TRACK:
            return new TextTrackFile({
              source,
              sourceFileFormatType,
              ...(loadOptions as TextTrackLoadOptions | undefined),
            });
          case TrackType.OBSERVATION_TRACK: {
            const observationLoadOptions = loadOptions as ObservationTrackLoadOptions | undefined;
            return new ObservationTrackFile({
              source,
              sourceFileFormatType,
              ...observationLoadOptions?.args,
            });
          }
          default:
            throw new Error('niy');
        }
      })
    );
  }
}
