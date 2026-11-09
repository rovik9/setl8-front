import { apiForOrigin } from "./profile";
import type { PostRoutes, ReadRoutes } from "./frontend-v1";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export const API_URL = apiForOrigin(
  import.meta.env?.VITE_API_URL,
  typeof window === "undefined" ? "" : window.location.origin,
);
export class ApiClient {
  csrf: string | null = null;
  onExpired: (() => void) | null = null;
  constructor(
    readonly base = API_URL,
    private transport: typeof fetch = (...args) => fetch(...args),
  ) {}
  async request<T>(
    path: string,
    options: {
      signal?: AbortSignal;
      body?: unknown;
      protectedPost?: boolean;
      authFailure?: boolean;
      maxBytes?: number;
    } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (options.body !== undefined)
      headers["Content-Type"] = "application/json";
    if (options.protectedPost) {
      if (!this.csrf)
        throw new ApiError(
          401,
          "unauthenticated",
          "Sign in again to continue.",
        );
      headers["X-Setl8-Csrf"] = this.csrf;
    }
    const response = await this.transport(this.base + path, {
      method: options.body === undefined ? "GET" : "POST",
      credentials: "include",
      headers,
      signal: options.signal,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
    if (!response.ok) {
      let error = {
        code: "request_failed",
        message:
          response.status === 503
            ? "The local service is unavailable. Try again when it is running."
            : `Request failed (${response.status}).`,
      };
      try {
        error = (await response.json()).error ?? error;
      } catch {
        /* no untrusted raw body */
      }
      if (
        response.status === 401 &&
        options.authFailure !== false &&
        !options.signal?.aborted
      )
        this.onExpired?.();
      throw new ApiError(response.status, error.code, error.message);
    }
    let value;
    if (options.maxBytes !== undefined) {
      const max = options.maxBytes;
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let text = "",
        size = 0;
      if (!reader)
        throw new ApiError(
          503,
          "response_unavailable",
          "Recorded history response is unavailable.",
        );
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > max) {
            await reader.cancel();
            throw new ApiError(
              503,
              "response_limit",
              "Recorded history exceeds the response size bound.",
            );
          }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
      value = JSON.parse(text);
    } else value = await response.json();
    if (value.api_version !== "1" && path !== "/healthz")
      throw new ApiError(
        502,
        "version_mismatch",
        "This service uses an unsupported API version.",
      );
    return value as T;
  }
  get<K extends keyof ReadRoutes>(
    path: K,
    signal?: AbortSignal,
  ): Promise<ReadRoutes[K]> {
    return this.request(path, { signal });
  }
  post<K extends keyof PostRoutes>(
    path: K,
    body: PostRoutes[K]["request"],
    signal?: AbortSignal,
  ): Promise<PostRoutes[K]["response"]> {
    return this.request(path, {
      body,
      signal,
      protectedPost:
        path === "/v1/auth/logout" || path === "/v1/auth/logout-all",
      authFailure: false,
    });
  }
}
export const api = new ApiClient();
export const errorMessage = (e: unknown) =>
  e instanceof TypeError
    ? `Cannot reach the local service at ${API_URL.replace(/^https?:\/\//, "")}. Check that it is running.`
    : e instanceof Error
      ? e.message
      : "Something went wrong. Try again.";
