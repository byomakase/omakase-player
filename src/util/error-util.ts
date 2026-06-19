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

export function extractErrorMessage(err: unknown): string {
  if (err === null || err === undefined) {
    return 'Unknown error';
  }
  if (typeof err === 'string') {
    return err;
  }
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const targetMessage = (obj['target'] as Record<string, unknown> | undefined)?.['error'];
    if (typeof targetMessage === 'object' && targetMessage !== null) {
      const msg = (targetMessage as Record<string, unknown>)['message'];
      if (typeof msg === 'string') return msg;
    }
    if (typeof obj['message'] === 'string') {
      return obj['message'];
    }
    const json = JSON.stringify(err);
    return json !== '{}' ? json : 'Unknown error';
  }
  return String(err);
}
