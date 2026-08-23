import process from "node:process";

const DEFAULT_BASE = "https://assess.praxicraft.com";

export class AssessClient {
  constructor(
    private apiKey?: string,
    private baseUrl = process.env.PRAXICRAFT_API_BASE_URL || DEFAULT_BASE,
  ) {}

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    bearerToken?: string,
  ): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
    const tokenToUse = bearerToken ?? this.apiKey;
    if (!tokenToUse) {
      throw new Error("Missing bearer token for Public API request.");
    }
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${tokenToUse}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* plain text */
    }
    if (!res.ok) {
      const errBody =
        typeof data === "object" && data !== null
          ? ("error" in data ? (data as { error: unknown }).error : data)
          : text;
      throw new Error(JSON.stringify(errBody));
    }
    return data as T;
  }

  get<T>(path: string) {
    return this.request<T>("GET", path, undefined, undefined);
  }

  getWithBearer<T>(path: string, bearerToken?: string) {
    return this.request<T>("GET", path, undefined, bearerToken);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>("POST", path, body, undefined);
  }

  postWithBearer<T>(path: string, body?: unknown, bearerToken?: string) {
    return this.request<T>("POST", path, body, bearerToken);
  }

  delete<T>(path: string, body?: unknown) {
    return this.request<T>("DELETE", path, body, undefined);
  }

  deleteWithBearer<T>(path: string, body?: unknown, bearerToken?: string) {
    return this.request<T>("DELETE", path, body, bearerToken);
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>("PUT", path, body, undefined);
  }

  putWithBearer<T>(path: string, body?: unknown, bearerToken?: string) {
    return this.request<T>("PUT", path, body, bearerToken);
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, body, undefined);
  }

  patchWithBearer<T>(path: string, body?: unknown, bearerToken?: string) {
    return this.request<T>("PATCH", path, body, bearerToken);
  }
}
