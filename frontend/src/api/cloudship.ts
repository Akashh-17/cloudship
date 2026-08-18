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
    | "FAILED";
  liveUrl?: string;
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

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
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

  getSiteUrl: (id: string, liveUrl?: string): string => {
    if (liveUrl) return liveUrl;
    return `${BASE_URL}/sites/${id}`;
  },
};
