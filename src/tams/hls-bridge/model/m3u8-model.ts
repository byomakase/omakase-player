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

/**
 * Represents an M3U8 Playlist containing various streams, media, and segments.
 */

type M3U8SegmentWithGap = M3U8Segment & {gap?: boolean};
export class M3U8Playlist {
  /**
   * The version of the HLS protocol (e.g., 3).
   */
  version: number;

  /**
   * Whether the playlist has independent segments.
   */
  independentSegments: boolean;

  /**
   * The maximum duration of any segment in the playlist (in seconds).
   */
  targetDuration: number | null = null;

  /**
   * The sequence number of the first segment in the playlist.
   */
  mediaSequence: number | null = null;

  /**
   * Program date-time in ISO 8601 format.
   */
  programDateTime: string | null = null;

  /**
   * Playlist type, which can be 'VOD' (Video on Demand) or 'EVENT'.
   */
  playlistType: 'VOD' | 'EVENT' | null = null;

  /**
   * List of stream information (video/audio variants).
   */
  streams: M3U8StreamInfo[] = [];

  /**
   * List of media options (AUDIO, VIDEO, SUBTITLES, CLOSED-CAPTIONS).
   */
  media: M3U8Media[] = [];

  /**
   * List of individual segments in the playlist.
   */

  segments: M3U8SegmentWithGap[] = [];

  /**
   * Whether to mark the end of the playlist (EXT-X-ENDLIST).
   */
  endList: boolean = false;

  startOffset?: number; // New property for EXT-X-START offset

  constructor(version: number = 3, independentSegments: boolean = false) {
    this.version = version;
    this.independentSegments = independentSegments;
  }
}

/**
 * Represents information about a specific video/audio stream variant.
 */
export class M3U8StreamInfo {
  /**
   * Maximum bandwidth for the stream in bits per second.
   */
  bandwidth: number;

  /**
   * Average bandwidth for the stream in bits per second.
   */
  averageBandwidth: number;

  /**
   * Resolution of the stream as width and height. Null if not specified.
   */
  resolution: {width: number; height: number} | null;

  /**
   * Frame rate of the stream. Null if not specified.
   */
  frameRate: number | null;

  /**
   * URI pointing to the specific stream playlist.
   */
  uri: string | null;

  constructor(bandwidth: number, averageBandwidth: number, resolution: {width: number; height: number} | null, frameRate: number | null, uri: string | null) {
    this.bandwidth = bandwidth;
    this.averageBandwidth = averageBandwidth;
    this.resolution = resolution;
    this.frameRate = frameRate;
    this.uri = uri;
  }
}

/**
 * Represents a media option such as AUDIO, VIDEO, SUBTITLES, or CLOSED-CAPTIONS.
 */
export class M3U8Media {
  /**
   * Type of media (e.g., AUDIO, VIDEO, SUBTITLES, CLOSED-CAPTIONS).
   */
  type: 'AUDIO' | 'VIDEO' | 'SUBTITLES' | 'CLOSED-CAPTIONS';

  /**
   * Group identifier to link this media with a stream.
   */
  groupId: string;

  /**
   * Descriptive name for the media track.
   */
  name: string;

  /**
   * Indicates if this is the default media track.
   */
  isDefault: boolean;

  /**
   * Indicates if the media track should auto-select if not explicitly selected.
   */
  autoSelect: boolean;

  /**
   * Number of audio channels (e.g., "2" for stereo). Null if not applicable.
   */
  channels: string | null;

  /**
   * URI pointing to the specific media playlist.
   */
  uri: string;

  /**
   * RFC 5646 language tag of the media track. Null when the flow declares none.
   */
  language: string | null;

  constructor(
    type: 'AUDIO' | 'VIDEO' | 'SUBTITLES' | 'CLOSED-CAPTIONS',
    groupId: string,
    name: string,
    isDefault: boolean,
    autoSelect: boolean,
    channels: string | null,
    uri: string,
    language: string | null = null
  ) {
    this.type = type;
    this.groupId = groupId;
    this.name = name;
    this.isDefault = isDefault;
    this.autoSelect = autoSelect;
    this.channels = channels;
    this.uri = uri;
    this.language = language;
  }
}

/**
 * Represents an individual segment within the playlist.
 */
export class M3U8Segment {
  /**
   * Duration of the segment in seconds.
   */
  duration: number;

  /**
   * URI pointing to the segment file.
   */
  uri: string;

  constructor(duration: number, uri: string) {
    this.duration = duration;
    this.uri = uri;
  }
}
