export interface BasicAuthenticationData {
    type: 'basic';
    username: string;
    password: string;
  }
  
  export interface BearerAuthenticationData {
    type: 'bearer';
    token: string;
  }
  
  export interface CustomAuthenticationData {
    type: 'custom';
    headers: (url: string) => { headers: { [header: string]: string } };
  }
  
  export type AuthenticationData = BasicAuthenticationData | BearerAuthenticationData | CustomAuthenticationData;