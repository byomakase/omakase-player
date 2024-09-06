/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import {ZodError} from 'zod';
import {ParseParams} from 'zod/lib/helpers/parseUtil';

export function parseErrorMessage(error: unknown): string {
  let message;
  if (typeof error === 'string') {
    message = error;
  } else if (error instanceof ZodError) {
    message = (error as ZodError).errors.map(p => p.message).join('. ');
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = 'Unexpected error';
  }

  return message;
}

export function zodErrorMapOverload(message: string): Partial<ParseParams> {
  return {
    errorMap: (issue, ctx) => {
      return {message}
    }
  }
}
