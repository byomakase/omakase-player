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

import {z} from 'zod';

export class Validators {

  public static id(): (value: string) => string {
    return (value: string) => {
      return z.coerce.string()
        .min(1)
        .max(100)
        .parse(value);
    }
  }

  public static description(): (value: string) => string {
    return (value: string) => {
      return z.coerce.string()
        .max(1000)
        .parse(value);
    }
  }

  public static boolean(): (value: boolean) => boolean {
    return (value: boolean) => {
      return z.coerce.boolean()
        .parse(value);
    }
  }

  public static url(): (value: string) => string {
    return (value: string) => {
      return z.coerce.string()
        .url()
        .parse(value);
    }
  }

}
