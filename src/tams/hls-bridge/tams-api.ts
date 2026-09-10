import {defer, from, map, Observable, of, switchMap} from 'rxjs';

function parseLinkHeader(linkHeader: string | null): Record<string, string> {
  if (!linkHeader) return {};

  const links: Record<string, string> = {};
  const parts = linkHeader.split(',');

  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match && match[1] && match[2]) {
      links[match[2]] = match[1];
    }
  }

  return links;
}

type TamsHeadersFunction = (url: string) => {headers: Record<string, string>};

export interface TamsApiResponse {
  data: any;
  headers: Headers;
  nextLink: string | undefined;
}

export class TamsApi {
  private apiEndpoint: string;
  private headersFunction: TamsHeadersFunction | undefined;

  constructor(apiEndpoint: string, headersFunction?: TamsHeadersFunction) {
    this.headersFunction = headersFunction;
    this.apiEndpoint = apiEndpoint;
  }

  setEndpoint(endpoint: string): void {
    this.apiEndpoint = endpoint;
  }

  getEndpoint(): string {
    return this.apiEndpoint;
  }

  setHeadersFunction(headersFunction: TamsHeadersFunction): void {
    this.headersFunction = headersFunction;
  }

  getHeadersFunction(): TamsHeadersFunction | undefined {
    return this.headersFunction;
  }

  private request(method: string, url: string, options: {body?: any; headers?: Record<string, string>} = {}): Observable<TamsApiResponse> {
    // defer so the request (and a fresh headersFunction/token) is evaluated per subscription
    return defer(() => {
      const authHeaders = this.headersFunction ? this.headersFunction(url).headers : {};

      return fetch(url, {
        method,
        headers: {
          ...authHeaders,
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : null,
      });
    }).pipe(
      switchMap((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const linkHeader = response.headers.get('link');
        const links = linkHeader ? parseLinkHeader(linkHeader) : {};
        const nextLink = links.next;

        return (method === 'GET' ? from(response.json()) : of(response.status)).pipe(map((data) => ({data, headers: response.headers, nextLink})));
      }),
    );
  }

  get(path: string, options = {}): Observable<TamsApiResponse> {
    return this.request('GET', `${this.apiEndpoint}${path}`, options);
  }

  put(path: string, body: any, options = {}): Observable<TamsApiResponse> {
    return this.request('PUT', `${this.apiEndpoint}${path}`, {...options, body});
  }

  del(path: string, options = {}): Observable<TamsApiResponse> {
    return this.request('DELETE', `${this.apiEndpoint}${path}`, options);
  }

  post(path: string, body: any, options = {}): Observable<TamsApiResponse> {
    return this.request('POST', `${this.apiEndpoint}${path}`, {...options, body});
  }

  getUrl(url: string, options = {}): Observable<TamsApiResponse> {
    return this.request('GET', url, options);
  }
}

export const getTamsApi = (apiEndpoint: string, headersFunction?: TamsHeadersFunction) => new TamsApi(apiEndpoint, headersFunction);
