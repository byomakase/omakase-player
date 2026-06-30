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

export enum FileFormatType {
  // Streaming
  HLS = 'HLS',
  DASH = 'DASH',

  // Video
  MP4 = 'MP4',
  MKV = 'MKV',
  WEBM = 'WEBM',
  AVI = 'AVI',
  MOV = 'MOV',

  // Audio
  MP4_AUDIO = 'MP4_AUDIO',
  MP3 = 'MP3',
  AAC = 'AAC',
  OGG = 'OGG',
  OPUS = 'OPUS',
  WAV = 'WAV',
  FLAC = 'FLAC',

  // Text
  VTT = 'VTT',
  SRT = 'SRT',
  SSA = 'SSA',
  ASS = 'ASS',
  TTML = 'TTML',
  SCC = 'SCC',
  STL = 'STL',
}

export class FileFormat {
  readonly type: FileFormatType;
  readonly mimeTypes: readonly string[];
  readonly extensions: readonly string[];

  constructor(type: FileFormatType, mimeTypes: readonly string[], extensions: readonly string[]) {
    this.type = type;
    this.mimeTypes = mimeTypes;
    this.extensions = extensions;
  }

  // Streaming
  static readonly HLS = new FileFormat(FileFormatType.HLS, ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl'], ['.m3u8']);
  static readonly DASH = new FileFormat(FileFormatType.DASH, ['application/dash+xml'], ['.mpd']);

  // Video
  static readonly MP4 = new FileFormat(FileFormatType.MP4, ['video/mp4'], ['.mp4', '.m4v']);
  static readonly MKV = new FileFormat(FileFormatType.MKV, ['video/x-matroska'], ['.mkv']);
  static readonly WEBM = new FileFormat(FileFormatType.WEBM, ['video/webm'], ['.webm']);
  static readonly AVI = new FileFormat(FileFormatType.AVI, ['video/x-msvideo'], ['.avi']);
  static readonly MOV = new FileFormat(FileFormatType.MOV, ['video/quicktime'], ['.mov']);

  // Audio
  static readonly MP4_AUDIO = new FileFormat(FileFormatType.MP4_AUDIO, ['audio/mp4'], ['.mp4', '.m4v']);
  static readonly MP3 = new FileFormat(FileFormatType.MP3, ['audio/mpeg', 'audio/mp3'], ['.mp3']);
  static readonly AAC = new FileFormat(FileFormatType.AAC, ['audio/aac'], ['.aac']);
  static readonly OGG = new FileFormat(FileFormatType.OGG, ['audio/ogg'], ['.ogg']);
  static readonly OPUS = new FileFormat(FileFormatType.OPUS, ['audio/opus'], ['.opus']);
  static readonly WAV = new FileFormat(FileFormatType.WAV, ['audio/wav', 'audio/x-wav'], ['.wav']);
  static readonly FLAC = new FileFormat(FileFormatType.FLAC, ['audio/flac', 'audio/x-flac'], ['.flac']);

  // Text
  static readonly VTT = new FileFormat(FileFormatType.VTT, ['text/vtt'], ['.vtt']);
  static readonly SRT = new FileFormat(FileFormatType.SRT, [], ['.srt']);
  static readonly SSA = new FileFormat(FileFormatType.SSA, [], ['.ssa']);
  static readonly ASS = new FileFormat(FileFormatType.ASS, [], ['.ass']);
  static readonly TTML = new FileFormat(FileFormatType.TTML, ['application/ttml+xml'], ['.ttml']);
  static readonly SCC = new FileFormat(FileFormatType.SCC, [], ['.scc']);
  static readonly STL = new FileFormat(FileFormatType.STL, [], ['.stl']);

  /** All supported streaming formats (HLS, DASH). */
  static readonly STREAMING: readonly FileFormat[] = [FileFormat.HLS, FileFormat.DASH];
  /** All supported video file formats (MP4, MKV, WEBM, AVI, MOV). */
  static readonly VIDEO: readonly FileFormat[] = [FileFormat.MP4, FileFormat.MKV, FileFormat.WEBM, FileFormat.AVI, FileFormat.MOV];
  /** All supported audio file formats (MP4_AUDIO, MP3, AAC, OGG, OPUS, WAV, FLAC). */
  static readonly AUDIO: readonly FileFormat[] = [FileFormat.MP4_AUDIO, FileFormat.MP3, FileFormat.AAC, FileFormat.OGG, FileFormat.OPUS, FileFormat.WAV, FileFormat.FLAC];
  /** All supported text/subtitle formats (VTT, SRT, SSA, ASS, TTML, SCC, STL). */
  static readonly TEXT: readonly FileFormat[] = [FileFormat.VTT, FileFormat.SRT, FileFormat.SSA, FileFormat.ASS, FileFormat.TTML, FileFormat.SCC, FileFormat.STL];

  /** All supported input formats across all categories. */
  static readonly ALL: readonly FileFormat[] = [...FileFormat.STREAMING, ...FileFormat.VIDEO, ...FileFormat.AUDIO, ...FileFormat.TEXT];

  private static _typeIndex: Map<FileFormatType, FileFormat> | undefined;
  private static _extensionIndex: Map<string, FileFormat> | undefined;
  private static _mimeIndex: Map<string, FileFormat> | undefined;

  static fromType(type: FileFormatType): FileFormat | undefined {
    if (!FileFormat._typeIndex) {
      FileFormat._typeIndex = new Map();
      for (const fmt of FileFormat.ALL) {
        FileFormat._typeIndex.set(fmt.type, fmt);
      }
    }
    return FileFormat._typeIndex.get(type);
  }

  static fromExtension(ext: string): FileFormat | undefined {
    if (!FileFormat._extensionIndex) {
      FileFormat._extensionIndex = new Map();
      for (const fmt of FileFormat.ALL) {
        for (const e of fmt.extensions) {
          FileFormat._extensionIndex.set(e, fmt);
        }
      }
    }
    return FileFormat._extensionIndex.get(ext);
  }

  static fromMimeType(mime: string): FileFormat | undefined {
    if (!FileFormat._mimeIndex) {
      FileFormat._mimeIndex = new Map();
      for (const fmt of FileFormat.ALL) {
        for (const m of fmt.mimeTypes) {
          FileFormat._mimeIndex.set(m, fmt);
        }
      }
    }
    const baseMime = mime.split(';')[0]!.trim().toLowerCase();
    return FileFormat._mimeIndex.get(baseMime);
  }
}
