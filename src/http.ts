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

export async function httpGetText(url: string, requestInit?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    method: 'GET',
    ...requestInit,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return await res.text();
}

export async function httpGetArrayBuffer(url: string, requestInit?: RequestInit): Promise<ArrayBuffer> {
  let res = await fetch(url, {
    method: 'GET',
    ...requestInit,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return res.arrayBuffer();
}

/**
 * Adds Range header for byte range [start, end), as in EXT-X-BYTERANGE (hls.js Fragment.byteRange). Empty or missing range
 * leaves request init as is.
 */
export function withByteRange(requestInit: RequestInit, byteRange?: [number, number] | [] | undefined): RequestInit {
  if (!byteRange || byteRange.length !== 2) {
    return requestInit;
  }
  return {
    ...requestInit,
    headers: {
      ...((requestInit.headers as Record<string, string> | undefined) ?? {}),
      Range: `bytes=${byteRange[0]}-${byteRange[1] - 1}`,
    },
  };
}
