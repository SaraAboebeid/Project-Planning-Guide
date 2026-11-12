/**
 * Email sign-in + saved projects (backend/accounts.py). The session lives in an
 * HttpOnly cookie on the same origin, so fetch sends it without any token
 * handling here.
 */

export interface ProjectMeta {
  id: string;
  name: string;
  summary: ProjectSummary;
  created_at: string;
  updated_at: string;
}

/** Shown in the project list without loading the whole project. */
export interface ProjectSummary {
  country?: string | null;
  city?: string | null;
  buildings?: number;
  step?: number;
}

/** Throws the backend's own `detail` message, which is written for the user. */
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try { detail = (await res.json()).detail ?? detail; } catch { /* not JSON */ }
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const accounts = {
  requestLink: (email: string) => call<{ ok: boolean; delivery: "email" | "log" }>("POST", "/auth/request-link", { email }),
  verify: (token: string) => call<{ email: string }>("POST", "/auth/verify", { token }),
  me: () => call<{ email: string | null }>("GET", "/auth/me"),
  logout: () => call<{ ok: boolean }>("POST", "/auth/logout"),

  listProjects: () => call<{ projects: ProjectMeta[] }>("GET", "/projects"),
  getProject: (id: string) => call<ProjectMeta & { data: SavedProjectData }>("GET", `/projects/${id}`),
  createProject: (name: string, data: SavedProjectData, summary: ProjectSummary) =>
    call<{ id: string; name: string; updated_at: string }>("POST", "/projects", { name, data, summary }),
  updateProject: (id: string, name: string, data: SavedProjectData, summary: ProjectSummary) =>
    call<{ id: string; name: string; updated_at: string }>("PUT", `/projects/${id}`, { name, data, summary }),
  renameProject: (id: string, name: string) => call<{ id: string; name: string }>("PATCH", `/projects/${id}`, { name }),
  deleteProject: (id: string) => call<{ ok: boolean }>("DELETE", `/projects/${id}`),
};

/** What a saved project holds: the wizard state, versioned so a later change
 *  to its shape can be migrated rather than silently misread. */
export interface SavedProjectData {
  version: 1;
  project: Record<string, unknown>;
  currentStep: number;
}
