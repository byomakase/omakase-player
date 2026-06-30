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
import {MediaMetadataResolver} from './media-metadata-resolver';
import {AuthConfig, FileFormat} from '../common';

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
  fileFormat?: FileFormat;
  candidates?: FileFormat[];
  metadata: Partial<MediaProbeMetadata>;
}

export interface MediaProbeResult {
  fileFormat: FileFormat;
  metadata: Partial<MediaProbeMetadata>;
}

/**
 * High-level media probing interface.
 * Runs the given probe tools in order, merging their results into a single {@link MediaProbeResult}.
 * Returns `undefined` if no tool could determine the file format.
 */
export interface MediaProbe {
  probe(url: string, toolTypes: MediaProbeToolType[]): Observable<MediaProbeResult | undefined>;
}

/**
 * Low-level probe tool that inspects a URL and returns a {@link MediaProbeToolResult}, or `undefined`
 * if the tool cannot contribute to format detection.
 *
 * When `candidates` are passed, the tool should attempt to narrow them to a unique `fileFormat`.
 * When a tool cannot uniquely resolve the format, it may return `candidates` itself — the pipeline
 * will continue to the next tool. If all tools are exhausted with candidates remaining, the first
 * candidate is used as the default.
 */
export interface MediaProbeTool {
  probe(url: string, candidates?: FileFormat[]): Observable<MediaProbeToolResult | undefined>;
}

/**
 * Identifies the strategy used to probe a media URL.
 *
 * - `EXTENSION_PROBE`: Infers the format from the URL file extension. Returns candidates for ambiguous extensions (e.g. `.mp4`).
 * - `HEAD_REQUEST_PROBE`: Sends an HTTP HEAD request and reads the `Content-Type` header.
 * - `MEDIA_METADATA_RESOLVER_PROBE`: Partially downloads the file to resolve its actual MIME type via mediabunny.
 *   Use this to disambiguate formats the server's `Content-Type` header misreports (e.g. audio-only MP4 served as `video/mp4`).
 */
export enum MediaProbeToolType {
  EXTENSION_PROBE = 'EXTENSION_PROBE',
  HEAD_REQUEST_PROBE = 'HEAD_REQUEST_PROBE',
  MEDIA_METADATA_RESOLVER_PROBE = 'MEDIA_METADATA_RESOLVER_PROBE',
}

export class ExtensionProbeTool implements MediaProbeTool {
  probe(url: string, _candidates?: FileFormat[]): Observable<MediaProbeToolResult | undefined> {
    try {
      // URL.pathname strips '?' and '#'; strip ';' (path parameters, e.g. /video.mp4;quality=high)
      const pathname = new URL(url).pathname.toLowerCase().split(';')[0]!;
      const matches: FileFormat[] = [];
      for (const fmt of FileFormat.ALL) {
        for (const ext of fmt.extensions) {
          if (pathname.endsWith(ext)) {
            matches.push(fmt);
            break;
          }
        }
      }
      if (matches.length === 1) {
        return of({fileFormat: matches[0]!, metadata: {}});
      } else if (matches.length > 1) {
        return of({candidates: matches, metadata: {}});
      }
    } catch {
      // malformed URL
      console.debug(`Failed to parse URL ${url}`);
    }
    return of(undefined);
  }
}

export class HeadRequestProbeTool implements MediaProbeTool {
  probe(url: string, candidates?: FileFormat[]): Observable<MediaProbeToolResult | undefined> {
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

        if (candidates && !candidates.includes(fileFormat)) {
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

        // video/mp4 is unreliable — servers report it for audio-only MP4 files too
        if (fileFormat === FileFormat.MP4) {
          return {candidates: [FileFormat.MP4, FileFormat.MP4_AUDIO], metadata};
        }

        return {fileFormat, metadata};
      })
    ).pipe(
      catchError((err) => {
        console.debug(`Failed to fetch HEAD for ${url}`, err);
        return of(undefined);
      })
    );
  }
}

export class MediaMetadataResolverProbe implements MediaProbeTool {
  probe(url: string, candidates?: FileFormat[]): Observable<MediaProbeToolResult | undefined> {
    return MediaMetadataResolver.getMediaMetadata(url, ['mimeType']).pipe(
      map((result): MediaProbeToolResult | undefined => {
        const fileFormat = result.mimeType ? FileFormat.fromMimeType(result.mimeType) : undefined;
        if (!fileFormat) {
          return undefined;
        }
        if (candidates && !candidates.includes(fileFormat)) {
          return undefined;
        }
        return {fileFormat, metadata: {}};
      }),
      catchError((err) => {
        console.debug(`[MediaMetadataResolverProbe] Failed to resolve MIME type for ${url}`, err);
        return of(undefined);
      })
    );
  }
}

export class MediaProbeImpl implements MediaProbe {
  private readonly _probeTools: Map<MediaProbeToolType, MediaProbeTool>;
  private readonly _customTools: MediaProbeTool[];

  constructor(tools?: MediaProbeTool[]) {
    this._probeTools = new Map<MediaProbeToolType, MediaProbeTool>([
      [MediaProbeToolType.EXTENSION_PROBE, new ExtensionProbeTool()],
      [MediaProbeToolType.HEAD_REQUEST_PROBE, new HeadRequestProbeTool()],
      [MediaProbeToolType.MEDIA_METADATA_RESOLVER_PROBE, new MediaMetadataResolverProbe()],
    ]);
    this._customTools = tools ?? [];
  }

  protected resolveDefaultCandidate(_url: string, candidates: FileFormat[]): FileFormat | undefined {
    return candidates[0];
  }

  probe(url: string, toolTypes: MediaProbeToolType[]): Observable<MediaProbeResult | undefined> {
    if (!toolTypes || toolTypes.length === 0) {
      throw new Error('At least one MediaProbeToolType must be provided');
    }
    const tools: MediaProbeTool[] = [
      ...toolTypes.map((t) => this._probeTools.get(t)).filter((t): t is MediaProbeTool => !!t),
      ...this._customTools,
    ];
    return this.runProbeAll(url, tools, 0, undefined, {});
  }

  private runProbeAll(
    url: string,
    tools: MediaProbeTool[],
    index: number,
    candidates: FileFormat[] | undefined,
    metadata: Partial<MediaProbeMetadata>
  ): Observable<MediaProbeResult | undefined> {
    if (index >= tools.length) {
      if (candidates?.length) {
        const resolvedFormat = this.resolveDefaultCandidate(url, candidates);
        if (resolvedFormat) {
          console.debug(`[MediaProbe] Format not uniquely resolved for ${url}, candidates: [${candidates.map((c) => c.type).join(', ')}], using default: ${resolvedFormat.type}`);
          return of({fileFormat: resolvedFormat, metadata});
        }
      }
      return of(undefined);
    }

    const tool = tools[index]!;

    return tool.probe(url, candidates).pipe(
      switchMap((result) => {
        if (!result) {
          return this.runProbeAll(url, tools, index + 1, candidates, metadata);
        }
        if (result.fileFormat) {
          const merged = {...metadata, ...result.metadata};
          return of({fileFormat: result.fileFormat, metadata: merged});
        }
        if (result.candidates?.length) {
          // Don't merge metadata — format is unresolved and metadata from this tool may be misleading
          return this.runProbeAll(url, tools, index + 1, result.candidates, metadata);
        }
        return this.runProbeAll(url, tools, index + 1, candidates, metadata);
      }),
      catchError(() => this.runProbeAll(url, tools, index + 1, candidates, metadata))
    );
  }
}
