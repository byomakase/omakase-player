// @ts-ignore
import wasmURL from '../wasm/MediaInfoModule.wasm?url';
import MediaInfoFactory, {MediaInfo, MediaInfoResult, VideoTrack} from 'mediainfo.js';
import {map, Observable, take} from 'rxjs';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import {formatAuthenticationHeaders} from '../http';
import {UrlUtil} from '../util/url-util';
import {FrameRateUtil} from '../util/frame-rate-util';

export class MediaInfoUtil {
  private constructor() {}

  private static createMediaInfo(): Observable<MediaInfo> {
    return new Observable<MediaInfo>((observer) => {
      MediaInfoFactory({
        locateFile: () => wasmURL,
        chunkSize: 1048576, // 1MB
      })
        .then((mediaInfo) => {
          nextCompleteObserver(observer, mediaInfo);
        })
        .catch((error) => {
          errorCompleteObserver(observer, error);
        });
    });
  }

  static findFrameRate(mediaInfoResult: MediaInfoResult): number | undefined {
    let frameRate: number | undefined = void 0;
    if (mediaInfoResult.media) {
      const videoTrack = mediaInfoResult.media.track.find((t) => t['@type'] === 'Video') as VideoTrack;

      if (videoTrack && videoTrack.FrameRate) {
        frameRate = videoTrack.FrameRate;
      } else {
        frameRate = FrameRateUtil.AUDIO_FRAME_RATE;
      }
    }

    return frameRate;
  }

  static analyze(src: string): Observable<MediaInfoResult> {
    const readChunk = (chunkSize: number, offset: number): Promise<Uint8Array> => {
      if (chunkSize <= 0) {
        return Promise.resolve(new Uint8Array());
      } else {
        return new Promise<Uint8Array>((resolve, reject) => {
          const end = offset + chunkSize - 1;
          const headers = {Range: `bytes=${offset}-${end}`};
          fetch(src, {headers, ...formatAuthenticationHeaders(src)})
            .then((res) => {
              if (!res.ok || !res.body) {
                reject(`Fetch failed with status ${res.status}`);
              }

              res
                .arrayBuffer()
                .then((arrayBuffer) => {
                  resolve(new Uint8Array(arrayBuffer));
                })
                .catch((error) => {
                  reject(error);
                });
            })
            .catch((error) => {
              reject(error);
            });
        });
      }
    };

    let contentLength$: Observable<number> = new Observable<number>((observer) => {
      if (UrlUtil.isDataBase64Url(src)) {
        let contentLength = UrlUtil.getDataBase64UrlContentLength(src);
        nextCompleteObserver(observer, contentLength);
      } else {
        fetch(src, {method: 'HEAD', headers: formatAuthenticationHeaders(src)})
          .then((res) => {
            const contentLength = res.headers.get('Content-Length') || res.headers.get('content-length');
            if (!contentLength) {
              errorCompleteObserver(observer, 'Missing Content-Length header');
            } else {
              nextCompleteObserver(observer, parseInt(contentLength));
            }
          })
          .catch((error) => {
            errorCompleteObserver(observer, error);
          });
      }
    });

    return new Observable<MediaInfoResult>((observer) => {
      this.createMediaInfo()
        .pipe(take(1))
        .subscribe({
          next: (mediaInfo) => {
            contentLength$.pipe(take(1)).subscribe({
              next: (contentLength) => {
                mediaInfo
                  .analyzeData(() => contentLength, readChunk)
                  .then((mediaInfoResult) => {
                    nextCompleteObserver(observer, mediaInfoResult);
                  })
                  .catch((error) => {
                    errorCompleteObserver(observer, error);
                  })
                  .finally(() => {
                    try {
                      mediaInfo.close();
                    } catch (e) {
                      console.debug(e);
                    }
                  });
              },
              error: (error) => {
                errorCompleteObserver(observer, error);
              },
            });
          },
          error: (error) => {
            errorCompleteObserver(observer, error);
          },
        });
    });
  }

  static analyzeFrameRate(src: string): Observable<number | undefined> {
    return this.analyze(src).pipe(map((p) => MediaInfoUtil.findFrameRate(p)));
  }
}
