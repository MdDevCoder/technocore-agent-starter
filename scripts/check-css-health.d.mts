export interface CssAssetResult {
  href: string;
  cssUrl: string;
  status: number;
  contentType: string | null;
  sizeBytes: number;
  hasRequiredTokens: boolean;
  error: string | null;
}

export interface RouteCheckResult {
  route: string;
  pageUrl: string;
  pageStatus: number;
  stylesheets: CssAssetResult[];
  errors: string[];
}

export interface CssHealthSummary {
  timestamp: string;
  baseUrl: string;
  healthy: boolean;
  totalRoutes: number;
  passedRoutes: number;
  failedRoutes: number;
  routeResults: RouteCheckResult[];
}

export function runCssHealthCheck(baseUrl?: string): Promise<CssHealthSummary>;
