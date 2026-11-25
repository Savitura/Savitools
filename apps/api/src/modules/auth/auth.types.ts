export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface FluxaAccount {
  tenantId: string;
  email: string;
}

export interface IssueSessionContext {
  ipAddress?: string;
  userAgent?: string;
}
