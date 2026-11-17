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

interface Box {
  type: string;
  /** Offset of box payload, after header */
  start: number;
  end: number;
}

interface VideoTrackInfo {
  trackId: number;
  timescale: number;
  defaultSampleDuration: number;
}

/**
 * Reads fMP4 sample times as they are appended to MSE SourceBuffer. Edit lists are not applied, browsers ignore them for fragmented MP4 in MSE,
 * unlike file parsers that present media as edited, ie. empty edit shifting presentation start is ignored by browser.
 */
export class Fmp4SampleTimes {
  /**
   * Lowest video presentation time of a media segment, decode time from `tfdt` plus sample composition offset, without edit lists.
   *
   * @param initSegment Init segment bytes, with `moov`
   * @param segment Media segment bytes, with `moof`
   * @returns first video frame time in seconds, undefined if there is no video track or samples
   */
  static getFirstVideoFrameTime(initSegment: Uint8Array, segment: Uint8Array): number | undefined {
    let videoTrack = this.findVideoTrack(initSegment);
    if (!videoTrack) {
      return void 0;
    }
    let view = new DataView(segment.buffer, segment.byteOffset, segment.byteLength);
    let firstVideoFrameTime: number | undefined;
    for (let moof of this.boxes(view, 0, view.byteLength).filter((p) => p.type === 'moof')) {
      for (let traf of this.boxes(view, moof.start, moof.end).filter((p) => p.type === 'traf')) {
        let time = this.trafFirstPresentationTime(view, traf, videoTrack);
        if (time !== void 0) {
          firstVideoFrameTime = firstVideoFrameTime === void 0 ? time : Math.min(firstVideoFrameTime, time);
        }
      }
    }
    return firstVideoFrameTime === void 0 ? void 0 : firstVideoFrameTime / videoTrack.timescale;
  }

  private static findVideoTrack(initSegment: Uint8Array): VideoTrackInfo | undefined {
    let view = new DataView(initSegment.buffer, initSegment.byteOffset, initSegment.byteLength);
    let moov = this.boxes(view, 0, view.byteLength).find((p) => p.type === 'moov');
    if (!moov) {
      return void 0;
    }
    let moovChildren = this.boxes(view, moov.start, moov.end);
    for (let trak of moovChildren.filter((p) => p.type === 'trak')) {
      let trakChildren = this.boxes(view, trak.start, trak.end);
      let tkhd = trakChildren.find((p) => p.type === 'tkhd');
      let mdia = trakChildren.find((p) => p.type === 'mdia');
      if (!tkhd || !mdia) {
        continue;
      }
      let mdiaChildren = this.boxes(view, mdia.start, mdia.end);
      let hdlr = mdiaChildren.find((p) => p.type === 'hdlr');
      let mdhd = mdiaChildren.find((p) => p.type === 'mdhd');
      // hdlr: version/flags (4), pre_defined (4), handler_type (4)
      if (!hdlr || !mdhd || this.fourCc(view, hdlr.start + 8) !== 'vide') {
        continue;
      }
      let tkhdVersion = view.getUint8(tkhd.start);
      // tkhd: version/flags (4), creation and modification time (8 or 16), track_ID (4)
      let trackId = view.getUint32(tkhd.start + (tkhdVersion === 1 ? 20 : 12));
      let mdhdVersion = view.getUint8(mdhd.start);
      // mdhd: version/flags (4), creation and modification time (8 or 16), timescale (4)
      let timescale = view.getUint32(mdhd.start + (mdhdVersion === 1 ? 20 : 12));

      let defaultSampleDuration = 0;
      let mvex = moovChildren.find((p) => p.type === 'mvex');
      if (mvex) {
        // trex: version/flags (4), track_ID (4), default_sample_description_index (4), default_sample_duration (4)
        let trex = this.boxes(view, mvex.start, mvex.end).find((p) => p.type === 'trex' && view.getUint32(p.start + 4) === trackId);
        if (trex) {
          defaultSampleDuration = view.getUint32(trex.start + 12);
        }
      }
      return {trackId, timescale, defaultSampleDuration};
    }
    return void 0;
  }

  /** Lowest presentation time of video samples in track fragment, in track timescale. */
  private static trafFirstPresentationTime(view: DataView, traf: Box, videoTrack: VideoTrackInfo): number | undefined {
    let children = this.boxes(view, traf.start, traf.end);
    let tfhd = children.find((p) => p.type === 'tfhd');
    if (!tfhd || view.getUint32(tfhd.start + 4) !== videoTrack.trackId) {
      return void 0;
    }
    let defaultSampleDuration = videoTrack.defaultSampleDuration;
    let tfhdFlags = view.getUint32(tfhd.start) & 0xffffff;
    // tfhd: version/flags (4), track_ID (4), optional base_data_offset (8), sample_description_index (4), default_sample_duration (4)
    let tfhdOffset = tfhd.start + 8;
    if (tfhdFlags & 0x1) {
      tfhdOffset += 8;
    }
    if (tfhdFlags & 0x2) {
      tfhdOffset += 4;
    }
    if (tfhdFlags & 0x8) {
      defaultSampleDuration = view.getUint32(tfhdOffset);
    }

    let tfdt = children.find((p) => p.type === 'tfdt');
    let decodeTime = 0;
    if (tfdt) {
      decodeTime = view.getUint8(tfdt.start) === 1 ? Number(view.getBigUint64(tfdt.start + 4)) : view.getUint32(tfdt.start + 4);
    }

    let firstPresentationTime: number | undefined;
    for (let trun of children.filter((p) => p.type === 'trun')) {
      let version = view.getUint8(trun.start);
      let flags = view.getUint32(trun.start) & 0xffffff;
      let sampleCount = view.getUint32(trun.start + 4);
      // trun: version/flags (4), sample_count (4), optional data_offset (4), optional first_sample_flags (4), then per sample fields
      let offset = trun.start + 8;
      if (flags & 0x1) {
        offset += 4;
      }
      if (flags & 0x4) {
        offset += 4;
      }
      for (let i = 0; i < sampleCount; i++) {
        let sampleDuration = defaultSampleDuration;
        let compositionOffset = 0;
        if (flags & 0x100) {
          sampleDuration = view.getUint32(offset);
          offset += 4;
        }
        if (flags & 0x200) {
          offset += 4;
        }
        if (flags & 0x400) {
          offset += 4;
        }
        if (flags & 0x800) {
          compositionOffset = version === 0 ? view.getUint32(offset) : view.getInt32(offset);
          offset += 4;
        }
        let presentationTime = decodeTime + compositionOffset;
        firstPresentationTime = firstPresentationTime === void 0 ? presentationTime : Math.min(firstPresentationTime, presentationTime);
        decodeTime += sampleDuration;
      }
    }
    return firstPresentationTime;
  }

  private static boxes(view: DataView, start: number, end: number): Box[] {
    let boxes: Box[] = [];
    let offset = start;
    while (offset + 8 <= end) {
      let size = view.getUint32(offset);
      let type = this.fourCc(view, offset + 4);
      let headerSize = 8;
      if (size === 1) {
        size = Number(view.getBigUint64(offset + 8));
        headerSize = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < headerSize || offset + size > end) {
        break;
      }
      boxes.push({type, start: offset + headerSize, end: offset + size});
      offset += size;
    }
    return boxes;
  }

  private static fourCc(view: DataView, offset: number): string {
    return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
  }
}
