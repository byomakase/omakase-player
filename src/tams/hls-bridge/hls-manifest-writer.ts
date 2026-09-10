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

import {M3U8Media, M3U8Playlist, M3U8Segment, M3U8StreamInfo} from './model/m3u8-model';

/**
 * Builder class to construct an M3U8Playlist instance.
 */
export class M3U8PlaylistBuilder {
  private playlist: M3U8Playlist;

  constructor() {
    this.playlist = new M3U8Playlist();
  }

  /**
   * Sets the HLS version for the playlist.
   * @param version The version number (e.g., 3).
   */
  setVersion(version: number): M3U8PlaylistBuilder {
    this.playlist.version = version;
    return this;
  }

  /**
   * Sets the independent segments flag.
   * @param independentSegments Whether the segments are independent.
   */
  setIndependentSegments(independentSegments: boolean): M3U8PlaylistBuilder {
    this.playlist.independentSegments = independentSegments;
    return this;
  }

  /**
   * Sets the target duration for the playlist.
   * This is the maximum duration (in seconds) of any segment in the playlist.
   * @param targetDuration The target duration in seconds.
   */
  setTargetDuration(targetDuration: number): M3U8PlaylistBuilder {
    this.playlist.targetDuration = targetDuration;
    return this;
  }

  /**
   * Sets the media sequence number for the playlist.
   * This is the sequence number of the first segment in the playlist.
   * @param mediaSequence The starting media sequence number.
   */
  setMediaSequence(mediaSequence: number): M3U8PlaylistBuilder {
    this.playlist.mediaSequence = mediaSequence;
    return this;
  }

  /**
   * Sets the program date-time for the playlist in ISO 8601 format.
   * @param programDateTime The program date-time as a string.
   */
  setProgramDateTime(programDateTime: string): M3U8PlaylistBuilder {
    this.playlist.programDateTime = programDateTime;
    return this;
  }

  /**
   * Sets the playlist type, which can be 'VOD' or 'EVENT'.
   * @param playlistType The type of the playlist.
   */
  setPlaylistType(playlistType: 'VOD' | 'EVENT'): M3U8PlaylistBuilder {
    this.playlist.playlistType = playlistType;
    return this;
  }

  /**
   * Adds a stream variant (e.g., a specific video resolution and bandwidth).
   * @param stream The stream information to add.
   */
  addStreamInfo(stream: M3U8StreamInfo): M3U8PlaylistBuilder {
    this.playlist.streams.push(stream);
    return this;
  }

  /**
   * Adds a media option (e.g., audio or subtitle track).
   * @param media The media option to add.
   */
  addMedia(media: M3U8Media): M3U8PlaylistBuilder {
    this.playlist.media.push(media);
    return this;
  }

  /**
   * Adds an individual segment to the playlist.
   * @param segment The segment to add.
   * @param gap Mark the segment with EXT-X-GAP tag
   */
  addSegment(segment: M3U8Segment, gap: boolean = false): M3U8PlaylistBuilder {
    const gapSegment = {
      ...segment,
      gap: gap,
    };
    this.playlist.segments.push(gapSegment);
    return this;
  }

  /**
   * Marks the playlist as ending with EXT-X-ENDLIST.
   */
  setEndList(): M3U8PlaylistBuilder {
    this.playlist.endList = true;
    return this;
  }

  /**
   * Sets the EXT-X-START offset for the playlist.
   * @param offset The start offset in seconds.
   */
  setStartOffset(offset: number): M3U8PlaylistBuilder {
    this.playlist.startOffset = offset;
    return this;
  }

  /**
   * Builds and returns the M3U8Playlist instance.
   */
  build(): M3U8Playlist {
    return this.playlist;
  }
}

/**
 * Writer class to generate an M3U8 formatted string from an M3U8Playlist instance.
 */
export class M3U8PlaylistWriter {
  /**
   * Converts an M3U8Playlist instance into a formatted M3U8 string.
   * @param playlist The M3U8Playlist to convert.
   * @returns The generated M3U8 playlist string.
   */
  static write(playlist: M3U8Playlist): string {
    let output = '#EXTM3U\n';
    output += `#EXT-X-VERSION:${playlist.version}\n`;

    if (playlist.independentSegments) {
      output += '#EXT-X-INDEPENDENT-SEGMENTS\n';
    }

    if (playlist.targetDuration !== null) {
      output += `#EXT-X-TARGETDURATION:${playlist.targetDuration}\n`;
    }

    if (playlist.mediaSequence !== null) {
      output += `#EXT-X-MEDIA-SEQUENCE:${playlist.mediaSequence}\n`;
    }

    if (playlist.programDateTime) {
      output += `#EXT-X-PROGRAM-DATE-TIME:${playlist.programDateTime}\n`;
    }

    if (playlist.playlistType) {
      output += `#EXT-X-PLAYLIST-TYPE:${playlist.playlistType}\n`;
    }

    if (playlist.startOffset !== undefined) {
      output += `#EXT-X-START:TIME-OFFSET=${playlist.startOffset}\n`;
    }

    const audioGroupId = playlist.media.find((media) => media.type === 'AUDIO')?.groupId;
    const subtitlesGroupId = playlist.media.find((media) => media.type === 'SUBTITLES')?.groupId;

    playlist.streams.forEach((stream) => {
      output += `#EXT-X-STREAM-INF:BANDWIDTH=${stream.bandwidth},AVERAGE-BANDWIDTH=${stream.averageBandwidth}`;
      if (stream.resolution) {
        output += `,RESOLUTION=${stream.resolution.width}x${stream.resolution.height}`;
      }
      if (stream.frameRate) {
        output += `,FRAME-RATE=${stream.frameRate}`;
      }
      if (audioGroupId) {
        output += `,AUDIO="${audioGroupId}"`;
      }
      if (subtitlesGroupId) {
        output += `,SUBTITLES="${subtitlesGroupId}"`;
      }
      if (stream.uri) {
        output += `\n${stream.uri}`;
      }
      output += `\n`;
    });

    playlist.media.forEach((media) => {
      output += `#EXT-X-MEDIA:TYPE=${media.type},GROUP-ID="${media.groupId}",NAME="${media.name}",DEFAULT=${media.isDefault ? 'YES' : 'NO'},AUTOSELECT=${media.autoSelect ? 'YES' : 'NO'}`;
      if (media.language) {
        output += `,LANGUAGE="${media.language}"`;
      }
      if (media.channels) {
        output += `,CHANNELS="${media.channels}"`;
      }
      output += `,URI="${media.uri}"\n`;
    });

    playlist.segments.forEach((segment) => {
      if (segment.gap) {
        output += '#EXT-X-GAP\n';
      }
      output += `#EXTINF:${segment.duration},\n${segment.uri}\n`;
    });

    if (playlist.endList) {
      output += '#EXT-X-ENDLIST\n';
    }

    return output;
  }
}
