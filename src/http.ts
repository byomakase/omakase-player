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

import axios, {AxiosRequestConfig, AxiosResponse} from 'axios';
import {AuthConfig} from './auth/auth-config';
import {BasicAuthenticationData, BearerAuthenticationData, CustomAuthenticationData} from './authentication/model';

export function httpGet<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return axios.get<T>(url, config);
}

export function formatAuthenticationHeaders(url: string): {[p: string]: string} | undefined {
  let headers: {[p: string]: string} | undefined = void 0;
  if (AuthConfig.authentication) {
    if (AuthConfig.authentication.type === 'basic') {
      const token = btoa(`${(AuthConfig.authentication as BasicAuthenticationData).username}:${(AuthConfig.authentication as BasicAuthenticationData)!.password}`);
      headers = {
        Authorization: `Basic ${token}`,
      };
    } else if (AuthConfig.authentication.type === 'bearer') {
      headers = {
        Authorization: `Bearer ${(AuthConfig.authentication as BearerAuthenticationData).token}`,
      };
    } else {
      const authenticationData = (AuthConfig.authentication as CustomAuthenticationData).headers(url);
      headers = authenticationData.headers;
    }
  }

  return headers;
}
