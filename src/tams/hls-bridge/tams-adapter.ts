import {M3U8PlaylistBuilder, M3U8PlaylistWriter} from './hls-manifest-writer';
import {M3U8Segment, M3U8StreamInfo, M3U8Media} from './model/m3u8-model';
import {TamsManifestRegistry} from './tams-manifest-registry';
import {TAMS_MANIFEST} from '../constants';

export type M3U8ManifestMetadata = {
  playlistType: 'VOD' | 'EVENT';
  programDateTime: string;
  independentSegments: boolean;
  targetDuration: number;
  version: number;
  mediaSequence: number;
  endList: boolean;
};

export type M3U8MasterManifestMetadata = {
  version: number;
  independentSegments: boolean;
};

export type M3U8MediaInfo = {
  type: 'AUDIO' | 'VIDEO' | 'SUBTITLES' | 'CLOSED-CAPTIONS';
  groupId?: string; // if not present defaults to lowercased type
  name?: string; // if not present defaults to ''
  isDefault: boolean;
  autoSelect: boolean;
  channels: string | null;
  language?: string | null;
};

export type BaseSegmentsWithMetadata = {
  segments: M3U8Segment[];
  metadata: Partial<M3U8ManifestMetadata>;
  id?: string | undefined;
};

export type AtLeastOneM3U8Info = {streamInfo: M3U8StreamInfo; mediaInfo?: M3U8MediaInfo} | {streamInfo?: M3U8StreamInfo; mediaInfo: M3U8MediaInfo};

// if mediaInfo is present, the segments will be treated as media even though stream info is present
// stream info will be used if no streams are present
export type SegmentsWithMetadata = BaseSegmentsWithMetadata & AtLeastOneM3U8Info;

export interface Manifest {
  url: string;
  video?: Map<string, string>;
  audio?: Map<string, string>;
  text?: Map<string, string>;
}

export const NON_PLAYABLE_GAP_URI = TAMS_MANIFEST.nonPlayableGapUri;

export function writeMediaPlaylist(source: SegmentsWithMetadata): string {
  const {segments, metadata} = source;

  let targetDuration = metadata.targetDuration;

  if (targetDuration === undefined) {
    targetDuration = Math.max(...segments.map((segment) => segment.duration), 1);
  }

  const builder = new M3U8PlaylistBuilder()
    .setVersion(metadata.version ?? TAMS_MANIFEST.mediaPlaylistVersion)
    .setIndependentSegments(metadata.independentSegments ?? true)
    .setTargetDuration(Math.ceil(targetDuration));

  if (metadata.mediaSequence !== undefined) {
    builder.setMediaSequence(metadata.mediaSequence);
  }

  if (metadata.programDateTime) {
    builder.setProgramDateTime(metadata.programDateTime);
  }

  if (metadata.playlistType) {
    builder.setPlaylistType(metadata.playlistType);
  }

  segments.forEach((s) => builder.addSegment(s, s.uri === NON_PLAYABLE_GAP_URI));

  if (metadata.endList !== false) {
    builder.setEndList();
  }

  return M3U8PlaylistWriter.write(builder.build());
}

export function exportSegmentsToManifest(sources: SegmentsWithMetadata[], masterManifestMetadata: M3U8MasterManifestMetadata): Manifest {
  const videoManifests = new Map<string, string>();
  const audioManifests = new Map<string, string>();
  const textManifests = new Map<string, string>();
  const hasAnyStream = sources.some((source) => source.streamInfo || source.mediaInfo?.type === 'AUDIO');

  if (!hasAnyStream) {
    throw new Error("Can't create an hls manifest without audio or video source");
  }

  const masterBuilder = new M3U8PlaylistBuilder().setVersion(TAMS_MANIFEST.masterPlaylistVersion).setIndependentSegments(masterManifestMetadata.independentSegments);

  const subManifestURIs: string[] = [];
  let hasVideoStream = sources.some(({streamInfo, mediaInfo}) => streamInfo && !mediaInfo);
  let isStreamAdded = false;

  for (let i = 0; i < sources.length; i++) {
    const {streamInfo, mediaInfo, id} = sources[i]!;

    const subM3U8 = writeMediaPlaylist(sources[i]!);
    const uri = TamsManifestRegistry.createUrl();
    TamsManifestRegistry.register(uri, subM3U8);

    if (streamInfo && !mediaInfo) {
      const stream = new M3U8StreamInfo(streamInfo.bandwidth, streamInfo.averageBandwidth, streamInfo.resolution, streamInfo.frameRate, uri);
      videoManifests.set(id ?? (videoManifests.size + 1).toString(), uri);
      masterBuilder.addStreamInfo(stream);
    } else if (mediaInfo) {
      const media = new M3U8Media(mediaInfo.type, mediaInfo.groupId ?? mediaInfo.type.toLowerCase(), mediaInfo.name ?? '', mediaInfo.isDefault, mediaInfo.autoSelect, mediaInfo.channels, uri, mediaInfo.language ?? null);
      if (mediaInfo.type === 'AUDIO') {
        audioManifests.set(id ?? mediaInfo.name ?? (audioManifests.size + 1).toString(), uri);
      } else if (mediaInfo.type !== 'VIDEO') {
        textManifests.set(id ?? mediaInfo.name ?? (textManifests.size + 1).toString(), uri);
      }
      masterBuilder.addMedia(media);
      if (!hasVideoStream && mediaInfo.type === 'AUDIO' && !isStreamAdded) {
        const stream = new M3U8StreamInfo(streamInfo?.bandwidth ?? 0, streamInfo?.averageBandwidth ?? 0, null, null, uri);
        masterBuilder.addStreamInfo(stream);
        isStreamAdded = true;
      }
    }

    subManifestURIs.push(uri);
  }

  const masterPlaylist = masterBuilder.build();
  const masterM3U8 = M3U8PlaylistWriter.write(masterPlaylist);
  const masterUri = TamsManifestRegistry.createUrl();
  TamsManifestRegistry.register(masterUri, masterM3U8);

  return {
    url: masterUri,
    video: videoManifests,
    audio: audioManifests,
    text: textManifests,
  };
}
