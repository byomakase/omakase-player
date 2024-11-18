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
import {AxiosRequestConfig} from 'axios';
import {AuthenticationData, BasicAuthenticationData, BearerAuthenticationData, CustomAuthenticationData} from '../authentication/model';

export class AuthUtil {
  static _authentication?: AuthenticationData;

  static set authentication(authentication: AuthenticationData | undefined) {
    this._authentication = authentication;
  }

  static get authentication(): AuthenticationData | undefined {
    return this._authentication;
  }

  static getAuthorizedAxiosConfig(url: string, authentication: AuthenticationData): AxiosRequestConfig {
    if (authentication.type === 'basic') {
      const token = btoa(`${(authentication as BasicAuthenticationData).username}:${(authentication as BasicAuthenticationData).password}`);
      return {
        headers: {
          Authorization: `Basic ${token}`,
        },
      };
    } else if (authentication.type === 'bearer') {
      return {
        headers: {
          Authorization: `Bearer ${(authentication as BearerAuthenticationData).token}`,
        },
      };
    } else {
      return (authentication as CustomAuthenticationData).headers(url);
    }
  }
}
