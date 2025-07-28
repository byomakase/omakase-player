/*
 * Copyright 2025 ByOmakase, LLC (https://byomakase.org)
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

import {VideoLoader} from './video-loader';
import {VideoProtocol} from './model';
import {VideoHlsLoader} from './video-hls-loader';
import {VideoNativeLoader} from './video-native-loader';
import {VideoAudioLoader} from './video-audio-loader';
import {OmpError} from '../types';
import {FileUtil} from '../util/file-util';
import {VideoControllerApi} from './video-controller-api';

export class VideoLoaderFactory {
  public static createVideoLoader(videoController: VideoControllerApi, sourceUrl: string, videoProtocol: VideoProtocol | undefined): VideoLoader {
    if (videoProtocol) {
      switch (videoProtocol) {
        case 'hls':
          return new VideoHlsLoader(videoController);
        case 'native':
          return new VideoNativeLoader(videoController);
        case 'audio':
          return new VideoAudioLoader(videoController);
        default:
          throw new OmpError(`Unrecognized video protocol`);
      }
    } else {
      let normalizedUrl = sourceUrl.toLowerCase();
      let url = new URL(normalizedUrl);
      let pathname = url.pathname;

      if (FileUtil.isM3u8File(pathname)) {
        return new VideoHlsLoader(videoController);
      } else if (FileUtil.isVideoFile(pathname)) {
        return new VideoNativeLoader(videoController);
      } else if (FileUtil.isAudioFile(pathname)) {
        return new VideoAudioLoader(videoController);
      } else {
        throw new OmpError(`Unable to resolve video loader from url. Try setting "options.protocol"`);
      }
    }
  }
}
