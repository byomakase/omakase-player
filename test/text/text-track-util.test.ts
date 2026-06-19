// @vitest-environment jsdom

import {describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  if (typeof globalThis.matchMedia === 'undefined') {
    (globalThis as any).matchMedia = () => ({
      matches: false,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  }
});

vi.mock('media-captions', () => ({
  CaptionsRenderer: class {},
  parseResponse: vi.fn(),
}));

import {TextTrackUtil} from '../../src/text/text-track-util';
import {FallbackFormat} from '../../src/media/text-track';
import {FileFormatType} from '../../src/common/file-format';

describe('TextTrackUtil', () => {
  describe('resolveOutputFormat', () => {
    it('should map FallbackFormat.TTML to FileFormatType.TTML', () => {
      expect(TextTrackUtil.resolveOutputFormat(FallbackFormat.TTML)).toBe(FileFormatType.TTML);
    });

    it('should map FallbackFormat.VTT to FileFormatType.VTT', () => {
      expect(TextTrackUtil.resolveOutputFormat(FallbackFormat.VTT)).toBe(FileFormatType.VTT);
    });

    it('should map FallbackFormat.SRT to FileFormatType.SRT', () => {
      expect(TextTrackUtil.resolveOutputFormat(FallbackFormat.SRT)).toBe(FileFormatType.SRT);
    });

    it('should map FallbackFormat.NONE to undefined', () => {
      expect(TextTrackUtil.resolveOutputFormat(FallbackFormat.NONE)).toBeUndefined();
    });

    it('should throw for unknown fallback format', () => {
      expect(() => TextTrackUtil.resolveOutputFormat('UNKNOWN' as any)).toThrow(/Unknown fallbackFormat/);
    });
  });

  describe('isUnplayableTextTrackFileFormatType', () => {
    it('should return true for SCC', () => {
      expect(TextTrackUtil.isUnplayableTextTrackFileFormatType(FileFormatType.SCC)).toBe(true);
    });

    it('should return true for STL', () => {
      expect(TextTrackUtil.isUnplayableTextTrackFileFormatType(FileFormatType.STL)).toBe(true);
    });

    it('should return false for VTT', () => {
      expect(TextTrackUtil.isUnplayableTextTrackFileFormatType(FileFormatType.VTT)).toBe(false);
    });

    it('should return false for SRT', () => {
      expect(TextTrackUtil.isUnplayableTextTrackFileFormatType(FileFormatType.SRT)).toBe(false);
    });

    it('should return false for TTML', () => {
      expect(TextTrackUtil.isUnplayableTextTrackFileFormatType(FileFormatType.TTML)).toBe(false);
    });

    it('should return false for ASS', () => {
      expect(TextTrackUtil.isUnplayableTextTrackFileFormatType(FileFormatType.ASS)).toBe(false);
    });

    it('should return false for SSA', () => {
      expect(TextTrackUtil.isUnplayableTextTrackFileFormatType(FileFormatType.SSA)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(TextTrackUtil.isUnplayableTextTrackFileFormatType(undefined)).toBe(false);
    });
  });
});
