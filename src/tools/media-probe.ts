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

import {from, Observable, of} from 'rxjs';
import {catchError, map, switchMap} from 'rxjs/operators';
import {type MediaMetadata, MediaMetadataResolver} from './media-metadata-resolver';
import {FileFormat} from '../common';
import {AuthConfig} from '../common';

export interface VideoProbeMetadata {
  frameRate: number;
  initSegmentTime: number;
}

export interface AudioProbeMetadata {
  channelsNumber: number;
  codec: string;
}

export interface MediaProbeMetadata {
  contentType: string;
  contentLength: number;
  video: Partial<VideoProbeMetadata>;
  audio: Partial<AudioProbeMetadata>;
}

export interface MediaProbeToolResult {
  fileFormat: FileFormat;
  metadata: Partial<MediaProbeMetadata>;
}

export interface MediaProbeResult {
  fileFormat: FileFormat;
  metadata: Partial<MediaProbeMetadata>;
}

export interface MediaProbe {
  probe(url: string, toolTypes: MediaProbeToolType[]): Observable<MediaProbeResult | undefined>;
}

export interface MediaProbeTool {
  probe(url: string): Observable<MediaProbeToolResult | undefined>;
}

/**
 * Identifies the strategy used to probe a media URL.
 *
 * - `EXTENSION_PROBE`: Infers the format from the URL file extension.
 * - `HEAD_REQUEST_PROBE`: Sends an HTTP HEAD request and reads the `Content-Type` header.
 * - `METADATA_RESOLVE`: Fetches deeper media metadata (e.g. frame rate, codec) by partially downloading the file.
 */
export enum MediaProbeToolType {
  EXTENSION_PROBE = 'EXTENSION_PROBE',
  HEAD_REQUEST_PROBE = 'HEAD_REQUEST_PROBE',
  METADATA_RESOLVE = 'METADATA_RESOLVE',
}

export class ExtensionProbeTool implements MediaProbeTool {
  probe(url: string): Observable<MediaProbeToolResult | undefined> {
    try {
      // URL.pathname strips '?' and '#'; strip ';' (path parameters, e.g. /video.mp4;quality=high)
      const pathname = new URL(url).pathname.toLowerCase().split(';')[0]!;
      for (const fmt of FileFormat.ALL) {
        for (const ext of fmt.extensions) {
          if (pathname.endsWith(ext)) {
            return of({fileFormat: fmt, metadata: {}});
          }
        }
      }
    } catch {
      // malformed URL
      console.debug(`Failed to parse URL ${url}`);
    }
    return of(undefined);
  }
}

export class HeadRequestProbeTool implements MediaProbeTool {
  probe(url: string): Observable<MediaProbeToolResult | undefined> {
    return from(
      fetch(url, {method: 'HEAD', ...AuthConfig.createRequestInit(url, AuthConfig.authentication)}).then((res): MediaProbeToolResult | undefined => {
        if (!res.ok) {
          return undefined;
        }

        const contentType = res.headers.get('content-type');
        const mime = contentType ? contentType.split(';')[0]!.trim().toLowerCase() : undefined;
        const fileFormat = mime ? FileFormat.fromMimeType(mime) : undefined;

        if (!fileFormat) {
          return undefined;
        }

        const metadata: Partial<MediaProbeMetadata> = {};
        if (mime) {
          metadata.contentType = mime;
        }

        const contentLength = res.headers.get('content-length');
        if (contentLength) {
          metadata.contentLength = parseInt(contentLength, 10);
        }

        return {fileFormat: fileFormat, metadata};
      })
    ).pipe(catchError((err) => {
      console.debug(`Failed to fetch HEAD for ${url}`, err);
      return of(undefined);
    }));
  }
}

const streamingFormats = new Set(FileFormat.STREAMING);

const videoFormats = new Set(FileFormat.VIDEO);

const audioFormats = new Set(FileFormat.AUDIO);

export class MediaMetadataResolveProbeTool {
  resolve(url: string, fileFormat?: FileFormat): Observable<Partial<MediaProbeMetadata> | undefined> {
    if (fileFormat && !streamingFormats.has(fileFormat) && !videoFormats.has(fileFormat) && !audioFormats.has(fileFormat)) {
      return of(undefined);
    }

    const resolveVideo = !fileFormat || streamingFormats.has(fileFormat) || videoFormats.has(fileFormat);
    const resolveAudio = !fileFormat || streamingFormats.has(fileFormat) || videoFormats.has(fileFormat) || audioFormats.has(fileFormat);

    const keys: (keyof MediaMetadata)[] = [];
    if (resolveVideo) {
      keys.push('firstVideoTrackFrameRate', 'firstVideoTrackInitSegmentTime');
    }
    if (resolveVideo || resolveAudio) {
      keys.push('firstAudioTrackChannelsNumber', 'firstAudioTrackAudioCodec');
    }

    return MediaMetadataResolver.getMediaMetadata(url, keys).pipe(
      map((result): Partial<MediaProbeMetadata> | undefined => {
        const metadata: Partial<MediaProbeMetadata> = {};

        if (resolveVideo) {
          const video: Partial<VideoProbeMetadata> = {};
          if (result.firstVideoTrackFrameRate !== undefined) {
            video.frameRate = result.firstVideoTrackFrameRate;
          }
          if (result.firstVideoTrackInitSegmentTime !== undefined) {
            video.initSegmentTime = result.firstVideoTrackInitSegmentTime;
          }
          if (Object.keys(video).length > 0) {
            metadata.video = video;
          }
        }

        if (resolveAudio) {
          const audio: Partial<AudioProbeMetadata> = {};
          if (result.firstAudioTrackChannelsNumber !== undefined) {
            audio.channelsNumber = result.firstAudioTrackChannelsNumber;
          }
          if (result.firstAudioTrackAudioCodec !== undefined) {
            audio.codec = result.firstAudioTrackAudioCodec;
          }
          if (Object.keys(audio).length > 0) {
            metadata.audio = audio;
          }
        }

        return Object.keys(metadata).length > 0 ? metadata : undefined;
      }),
      catchError((err) => {
        console.debug(`Failed to resolve metadata for ${url}`, err);
        return of(undefined)
      })
    );
  }
}

export class MediaProbeImpl implements MediaProbe {
  private readonly _probeTools: Map<MediaProbeToolType, MediaProbeTool>;
  private readonly _metadataResolveTool: MediaMetadataResolveProbeTool;

  constructor(tools?: MediaProbeTool[]) {
    this._probeTools = new Map<MediaProbeToolType, MediaProbeTool>([
      [MediaProbeToolType.EXTENSION_PROBE, new ExtensionProbeTool()],
      [MediaProbeToolType.HEAD_REQUEST_PROBE, new HeadRequestProbeTool()],
      ...(tools ?? []).map((tool, i) => [`custom_${i}` as unknown as MediaProbeToolType, tool] as const),
    ]);
    this._metadataResolveTool = new MediaMetadataResolveProbeTool();
  }

  probe(url: string, toolTypes: MediaProbeToolType[]): Observable<MediaProbeResult | undefined> {
    if (!toolTypes || toolTypes.length === 0) {
      throw new Error('At least one MediaProbeToolType must be provided');
    }
    return this.runProbeAll(url, toolTypes, 0, undefined, {});
  }

  private runProbeAll(
    url: string,
    toolTypes: MediaProbeToolType[],
    index: number,
    fileFormat: FileFormat | undefined,
    metadata: Partial<MediaProbeMetadata>
  ): Observable<MediaProbeResult | undefined> {
    if (index >= toolTypes.length) {
      if (!fileFormat) {
        return of(undefined);
      }
      return of({fileFormat: fileFormat, metadata});
    }

    const toolType = toolTypes[index]!;

    if (toolType === MediaProbeToolType.METADATA_RESOLVE) {
      if (fileFormat && !streamingFormats.has(fileFormat) && !videoFormats.has(fileFormat) && !audioFormats.has(fileFormat)) {
        return this.runProbeAll(url, toolTypes, index + 1, fileFormat, metadata);
      }
      return this._metadataResolveTool.resolve(url, fileFormat).pipe(
        switchMap((resolvedMetadata) => {
          const merged = {...metadata, ...resolvedMetadata};
          return this.runProbeAll(url, toolTypes, index + 1, fileFormat, merged);
        }),
        catchError(() => this.runProbeAll(url, toolTypes, index + 1, fileFormat, metadata))
      );
    }

    const tool = this._probeTools.get(toolType);
    if (!tool) {
      return this.runProbeAll(url, toolTypes, index + 1, fileFormat, metadata);
    }

    return tool.probe(url).pipe(
      switchMap((result) => {
        if (!result) {
          return this.runProbeAll(url, toolTypes, index + 1, fileFormat, metadata);
        }
        if (!fileFormat) {
          const merged = {...metadata, ...result.metadata};
          return this.runProbeAll(url, toolTypes, index + 1, result.fileFormat, merged);
        }
        if (fileFormat !== result.fileFormat) {
          console.debug(`[MediaProbe] Conflicting file formats detected for ${url}: ${fileFormat.type} vs ${result.fileFormat.type}`);
          return of(undefined);
        }
        const merged = {...metadata, ...result.metadata};
        return this.runProbeAll(url, toolTypes, index + 1, fileFormat, merged);
      }),
      catchError(() => this.runProbeAll(url, toolTypes, index + 1, fileFormat, metadata))
    );
  }
}
