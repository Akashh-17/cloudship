const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export interface Deployment {
  id: string;
  repoUrl: string;
  branch?: string;
  frontendDir?: string;
  customSlug?: string;
  envVars?: Record<string, string>;
  status:
    | "QUEUED"
    | "CLONING"
    | "INSTALLING"
    | "BUILDING"
  | "UPLOADING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED";
  liveUrl?: string;
  publicKey?: string;
  failureCategory?: string;
  failureMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeploymentPayload {
  repoUrl: string;
  branch?: string;
  frontendDir?: string;
  customSlug?: string;
  envVars?: Record<string, string>;
}

export interface User {
  id: string;
  login: string;
  avatarUrl?: string;
  email?: string;
  createdAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include", // required so the session cookie is sent/stored
    ...options,
  });

  if (res.status === 401) {
    throw new Error("Authentication required");
  }

  const json: ApiResponse<T> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(
      (json as any).error?.message ||
        (json as any).message ||
        "An unknown error occurred"
    );
  }
  return json.data;
}

export const cloudshipApi = {
  listDeployments: (): Promise<Deployment[]> =>
    request<Deployment[]>("/api/v1/deployments"),

  createDeployment: (payload: CreateDeploymentPayload): Promise<Deployment> =>
    request<Deployment>("/api/v1/deployments/deploy", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getDeploymentStatus: (id: string): Promise<Deployment> =>
    request<Deployment>(`/api/v1/deployments/${id}`),

  deleteDeployment: (id: string): Promise<void> =>
    request<null>(`/api/v1/deployments/${id}`, { method: "DELETE" }).then(() => undefined),

  getSiteUrl: (id: string, liveUrl?: string): string => {
    if (liveUrl) return liveUrl;
    return `${BASE_URL}/sites/${id}`;
  },

  // ── Auth ────────────────────────────────────────────────────────────────
  getMe: (): Promise<User> => request<User>("/auth/me"),

  logout: (): Promise<void> =>
    request<null>("/auth/logout", { method: "POST" }).then(() => undefined),

  getGitHubLoginUrl: (): string => `${BASE_URL}/auth/github`,

  getWebhookUrl: (): string => `${BASE_URL}/api/v1/webhooks/github`,

  // ── Logs ────────────────────────────────────────────────────────────────
  getLogDelta: (id: string, cursor: number): Promise<{ lines: string[]; cursor: number; done: boolean; status: Deployment["status"] }> =>
    request(`/api/v1/deployments/${id}/logs?cursor=${cursor}`),

  getFullLog: (id: string): Promise<string> =>
    fetch(`${BASE_URL}/api/v1/deployments/${id}/logs`, { credentials: "include" }).then((r) => r.text()),
};
