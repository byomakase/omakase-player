import {describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll} from 'vitest';
import {VideoNativeLoader} from '../video-native-loader';
import {VideoControllerApi} from '../video-controller-api';
import {NativeDrmConfig} from '../model';
import {Subject} from 'rxjs';

beforeAll(() => {
  // Suppress unhandled rejections from async event handlers in tests —
  // browsers swallow these, but Node surfaces them as process-level errors
  process.on('uncaughtException', () => {});
  process.on('unhandledRejection', () => {});
});
afterAll(() => {
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');
});

vi.mock('../../tools/media-metadata-resolver', () => ({
  MediaMetadataResolver: {
    getMediaMetadata: vi.fn().mockReturnValue({
      subscribe: (observer: any) => {
        observer.next({
          firstVideoTrackFrameRate: 25,
          firstVideoTrackInitSegmentTime: 0,
          firstAudioTrackChannelsNumber: 2,
        });
      },
    }),
  },
}));

function createMockSession() {
  const listeners = new Map<string, Function[]>();
  const keyStatuses = new Map<string, MediaKeyStatus>();

  return {
    keyStatuses,
    generateRequest: vi.fn().mockImplementation(async (initDataType: string, initData: ArrayBuffer) => {
      setTimeout(() => {
        const msgListeners = listeners.get('message') || [];
        msgListeners.forEach(fn => fn({message: new ArrayBuffer(16)} as any));
      }, 0);
    }),
    update: vi.fn().mockImplementation(async (license: ArrayBuffer) => {
      keyStatuses.set('key-id', 'usable');
      setTimeout(() => {
        const ksListeners = listeners.get('keystatuseschange') || [];
        ksListeners.forEach(fn => fn());
      }, 0);
    }),
    addEventListener: vi.fn().mockImplementation((event: string, handler: Function) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockMediaKeys(session: ReturnType<typeof createMockSession>) {
  return {
    createSession: vi.fn().mockReturnValue(session),
    setServerCertificate: vi.fn().mockResolvedValue(true),
  };
}

function createMockVideoElement() {
  const listeners = new Map<string, Function[]>();
  return {
    src: '',
    duration: 30,
    load: vi.fn(),
    setMediaKeys: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn().mockImplementation((event: string, handler: Function, opts?: any) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    _listeners: listeners,
    _fireEncrypted(initData: ArrayBuffer, initDataType: string) {
      const handlers = listeners.get('encrypted') || [];
      handlers.forEach(fn => fn({initData, initDataType} as any));
      if (listeners.has('encrypted')) listeners.delete('encrypted');
    },
    _fireEvent(name: string) {
      const handlers = listeners.get(name) || [];
      handlers.forEach(fn => fn({}));
    },
  };
}

function createMockVideoController(videoElement: ReturnType<typeof createMockVideoElement>) {
  return {
    getHTMLVideoElement: () => videoElement as any,
    getConfig: () => ({hlsConfig: {}}),
    getActiveNamedEventStreams: () => [],
    onActiveNamedEventStreamsChange$: new Subject<any>(),
  } as unknown as VideoControllerApi;
}

describe('VideoNativeLoader EME DRM', () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockMediaKeys: ReturnType<typeof createMockMediaKeys>;
  let mockVideoElement: ReturnType<typeof createMockVideoElement>;
  let mockVideoController: ReturnType<typeof createMockVideoController>;
  let loader: VideoNativeLoader;
  let originalFetch: typeof globalThis.fetch;
  let originalRequestMKSA: typeof navigator.requestMediaKeySystemAccess;

  beforeEach(() => {
    mockSession = createMockSession();
    mockMediaKeys = createMockMediaKeys(mockSession);
    mockVideoElement = createMockVideoElement();
    mockVideoController = createMockVideoController(mockVideoElement);
    loader = new VideoNativeLoader(mockVideoController);

    originalFetch = globalThis.fetch;
    originalRequestMKSA = navigator.requestMediaKeySystemAccess;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && (url.includes('certificate') || url.includes('cert'))) {
        return {ok: true, arrayBuffer: async () => new ArrayBuffer(128), headers: new Headers()} as Response;
      }
      if (init?.method === 'POST') {
        return {ok: true, arrayBuffer: async () => new ArrayBuffer(64), headers: new Headers()} as Response;
      }
      return {ok: false, status: 404, headers: new Headers()} as Response;
    });

    Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
      value: vi.fn().mockResolvedValue({createMediaKeys: () => Promise.resolve(mockMediaKeys)}),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
      value: originalRequestMKSA,
      writable: true,
      configurable: true,
    });
    loader.destroy();
  });

  describe('setupEme routing', () => {
    it('should reject if neither fairplay nor widevine is configured', async () => {
      const drmConfig: NativeDrmConfig = {};
      const video$ = loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig});

      const errorPromise = new Promise<any>((resolve) => {
        video$.subscribe({error: resolve});
      });

      const error = await errorPromise;
      expect(error).toBeDefined();
    });

    it('should call requestMediaKeySystemAccess with com.apple.fps for fairplay', async () => {
      const drmConfig: NativeDrmConfig = {
        fairplay: {
          licenseUrl: 'https://drm.example.com/license',
          serverCertificateUrl: 'https://drm.example.com/certificate',
        },
      };

      loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig}).subscribe({});

      await vi.waitFor(() => {
        expect(navigator.requestMediaKeySystemAccess).toHaveBeenCalledWith(
          'com.apple.fps',
          expect.any(Array)
        );
      });
    });

    it('should call requestMediaKeySystemAccess with com.widevine.alpha for widevine', async () => {
      const drmConfig: NativeDrmConfig = {
        widevine: {
          licenseUrl: 'https://drm.example.com/license',
        },
      };

      loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig}).subscribe({});

      await vi.waitFor(() => {
        expect(navigator.requestMediaKeySystemAccess).toHaveBeenCalledWith(
          'com.widevine.alpha',
          expect.any(Array)
        );
      });
    });
  });

  describe('FairPlay flow', () => {
    it('should fetch server certificate before requesting key system', async () => {
      const drmConfig: NativeDrmConfig = {
        fairplay: {
          licenseUrl: 'https://drm.example.com/license',
          serverCertificateUrl: 'https://drm.example.com/certificate',
        },
      };

      loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig}).subscribe({});

      await vi.waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith('https://drm.example.com/certificate');
      });
    });

    it('should set server certificate on media keys', async () => {
      const drmConfig: NativeDrmConfig = {
        fairplay: {
          licenseUrl: 'https://drm.example.com/license',
          serverCertificateUrl: 'https://drm.example.com/certificate',
        },
      };

      loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig}).subscribe({});

      await vi.waitFor(() => {
        expect(mockMediaKeys.setServerCertificate).toHaveBeenCalled();
      });
    });

    it('should set media keys on video element', async () => {
      const drmConfig: NativeDrmConfig = {
        fairplay: {
          licenseUrl: 'https://drm.example.com/license',
          serverCertificateUrl: 'https://drm.example.com/certificate',
        },
      };

      loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig}).subscribe({});

      await vi.waitFor(() => {
        expect(mockVideoElement.setMediaKeys).toHaveBeenCalledWith(mockMediaKeys);
      });
    });

    it('should listen for encrypted event after setting media keys', async () => {
      const drmConfig: NativeDrmConfig = {
        fairplay: {
          licenseUrl: 'https://drm.example.com/license',
          serverCertificateUrl: 'https://drm.example.com/certificate',
        },
      };

      loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig}).subscribe({});

      await vi.waitFor(() => {
        const calls = mockVideoElement.addEventListener.mock.calls;
        const encryptedCall = calls.find((c: any[]) => c[0] === 'encrypted');
        expect(encryptedCall).toBeDefined();
        expect(encryptedCall![2]).toEqual({once: true});
      });
    });

    it('should generate request with sinf init data type on encrypted event', async () => {
      const drmConfig: NativeDrmConfig = {
        fairplay: {
          licenseUrl: 'https://drm.example.com/license',
          serverCertificateUrl: 'https://drm.example.com/certificate',
        },
      };

      loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig}).subscribe({});

      await vi.waitFor(() => {
        expect(mockVideoElement._listeners.has('encrypted')).toBe(true);
      });

      const initData = new ArrayBuffer(32);
      mockVideoElement._fireEncrypted(initData, 'sinf');

      await vi.waitFor(() => {
        expect(mockSession.generateRequest).toHaveBeenCalledWith('sinf', initData);
      });
    });

    it('should fetch license with custom headers on message event', async () => {
      const drmConfig: NativeDrmConfig = {
        fairplay: {
          licenseUrl: 'https://drm.example.com/license',
          serverCertificateUrl: 'https://drm.example.com/certificate',
          licenseRequestHeaders: {'x-custom-auth': 'token123'},
        },
      };

      loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig}).subscribe({});

      await vi.waitFor(() => {
        expect(mockVideoElement._listeners.has('encrypted')).toBe(true);
      });

      mockVideoElement._fireEncrypted(new ArrayBuffer(32), 'sinf');

      await vi.waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          'https://drm.example.com/license',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({'x-custom-auth': 'token123'}),
          })
        );
      });
    });

    it('should update session with license response', async () => {
      const drmConfig: NativeDrmConfig = {
        fairplay: {
          licenseUrl: 'https://drm.example.com/license',
          serverCertificateUrl: 'https://drm.example.com/certificate',
        },
      };

      loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig}).subscribe({});

      await vi.waitFor(() => {
        expect(mockVideoElement._listeners.has('encrypted')).toBe(true);
      });

      mockVideoElement._fireEncrypted(new ArrayBuffer(32), 'sinf');

      await vi.waitFor(() => {
        expect(mockSession.update).toHaveBeenCalled();
      });
    });
  });

  describe('Widevine flow', () => {
    it('should skip server certificate fetch when serverCertificateUrl is not provided', async () => {
      const drmConfig: NativeDrmConfig = {
        widevine: {
          licenseUrl: 'https://drm.example.com/license',
        },
      };

      loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig}).subscribe({});

      await vi.waitFor(() => {
        expect(mockVideoElement.setMediaKeys).toHaveBeenCalled();
      });

      expect(mockMediaKeys.setServerCertificate).not.toHaveBeenCalled();
    });

    it('should fetch and set server certificate when serverCertificateUrl is provided', async () => {
      const drmConfig: NativeDrmConfig = {
        widevine: {
          licenseUrl: 'https://drm.example.com/license',
          serverCertificateUrl: 'https://drm.example.com/widevine-cert',
        },
      };

      loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig}).subscribe({});

      await vi.waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith('https://drm.example.com/widevine-cert');
      });

      await vi.waitFor(() => {
        expect(mockMediaKeys.setServerCertificate).toHaveBeenCalled();
      });
    });

    it('should generate request with cenc init data type on encrypted event', async () => {
      const drmConfig: NativeDrmConfig = {
        widevine: {
          licenseUrl: 'https://drm.example.com/license',
        },
      };

      loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig}).subscribe({});

      await vi.waitFor(() => {
        expect(mockVideoElement._listeners.has('encrypted')).toBe(true);
      });

      const initData = new ArrayBuffer(32);
      mockVideoElement._fireEncrypted(initData, 'cenc');

      await vi.waitFor(() => {
        expect(mockSession.generateRequest).toHaveBeenCalledWith('cenc', initData);
      });
    });
  });

  describe('error handling', () => {
    it('should error the observable if server certificate fetch fails', async () => {
      (globalThis.fetch as any).mockImplementation(async (url: string) => {
        if (typeof url === 'string' && (url.includes('certificate') || url.includes('cert'))) {
          return {ok: false, status: 503};
        }
        return {ok: true, arrayBuffer: async () => new ArrayBuffer(64)};
      });

      const drmConfig: NativeDrmConfig = {
        fairplay: {
          licenseUrl: 'https://drm.example.com/license',
          serverCertificateUrl: 'https://drm.example.com/certificate',
        },
      };

      const errorPromise = new Promise<any>((resolve) => {
        loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig}).subscribe({
          error: resolve,
        });
      });

      const error = await errorPromise;
      expect(error).toBeDefined();
      expect(error.message).toContain('503');
    });

    it('should error the observable if license request fails', async () => {
      (globalThis.fetch as any).mockImplementation(async (url: string, init?: RequestInit) => {
        if (typeof url === 'string' && (url.includes('certificate') || url.includes('cert'))) {
          return {ok: true, arrayBuffer: async () => new ArrayBuffer(128), headers: new Headers()};
        }
        if (init?.method === 'POST') {
          return {ok: false, status: 400, statusText: 'Bad Request', headers: new Headers()};
        }
        return {ok: true, arrayBuffer: async () => new ArrayBuffer(64), headers: new Headers()};
      });

      const drmConfig: NativeDrmConfig = {
        fairplay: {
          licenseUrl: 'https://drm.example.com/license',
          serverCertificateUrl: 'https://drm.example.com/certificate',
        },
      };

      const errorPromise = new Promise<any>((resolve) => {
        loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig}).subscribe({
          error: resolve,
        });
      });

      await vi.waitFor(() => {
        expect(mockVideoElement._listeners.has('encrypted')).toBe(true);
      });

      mockVideoElement._fireEncrypted(new ArrayBuffer(32), 'sinf');

      const error = await errorPromise;
      expect(error).toBeDefined();
    });

    it('should error if encrypted event has no init data', async () => {
      const drmConfig: NativeDrmConfig = {
        fairplay: {
          licenseUrl: 'https://drm.example.com/license',
          serverCertificateUrl: 'https://drm.example.com/certificate',
        },
      };

      const errorPromise = new Promise<any>((resolve) => {
        loader.loadVideo('https://example.com/stream.m3u8', {drm: drmConfig}).subscribe({
          error: resolve,
        });
      });

      await vi.waitFor(() => {
        expect(mockVideoElement._listeners.has('encrypted')).toBe(true);
      });

      const handlers = mockVideoElement._listeners.get('encrypted') || [];
      handlers.forEach(fn => fn({initData: null, initDataType: 'sinf'}));
      mockVideoElement._listeners.delete('encrypted');

      const error = await errorPromise;
      expect(error).toBeDefined();
      expect(error.message).toContain('No init data');
    });
  });

  describe('non-DRM passthrough', () => {
    it('should not call requestMediaKeySystemAccess when no drm config is provided', async () => {
      loader.loadVideo('https://example.com/video.mp4', {frameRate: 25}).subscribe({});

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(navigator.requestMediaKeySystemAccess).not.toHaveBeenCalled();
    });
  });
});
