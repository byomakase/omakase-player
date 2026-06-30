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

/** Authentication data for HTTP Basic auth. */
export interface BasicAuthenticationData {
  type: 'basic';
  /** Basic auth username. */
  username: string;
  /** Basic auth password. */
  password: string;
}

/** Authentication data for Bearer token auth. */
export interface BearerAuthenticationData {
  type: 'bearer';
  /** Bearer token included in the `Authorization` header. */
  token: string;
}

/** Authentication data with a custom header factory. */
export interface CustomAuthenticationData {
  type: 'custom';
  /** Returns request headers to apply for the given URL. */
  headers: (url: string) => {headers: Record<string, string>};
}

/** Union of all supported authentication strategies. */
export type AuthenticationData = BasicAuthenticationData | BearerAuthenticationData | CustomAuthenticationData;

export class AuthConfig {
  static _authentication?: AuthenticationData | undefined;

  static set authentication(authentication: AuthenticationData | undefined) {
    this._authentication = authentication;
  }

  static get authentication(): AuthenticationData | undefined {
    return this._authentication;
  }

  /**
   * Creates a fetch-compatible RequestInit object
   */
  static createRequestInit(url: string, authentication?: AuthenticationData): RequestInit {
    if (!authentication) {
      return {};
    }

    if (authentication.type === 'basic') {
      const token = btoa(`${authentication.username}:${authentication.password}`);

      return {
        headers: {
          Authorization: `Basic ${token}`,
        },
      };
    }

    if (authentication.type === 'bearer') {
      return {
        headers: {
          Authorization: `Bearer ${authentication.token}`,
        },
      };
    }

    return authentication.headers(url);
  }
}
