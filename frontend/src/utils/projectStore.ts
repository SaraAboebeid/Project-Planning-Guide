/* Where saved projects live.

   Signed in (LOGIN_ENABLED + an email): the user's account on the server
   (backend/accounts.py), as before.
   Otherwise: this browser, in IndexedDB. Login is switched off for now (no
   working mail delivery), and "save a project and come back to it" has to work
   without it. Browser projects stay on this computer and browser only; they
   are not shared and are lost if the browser's site data is cleared.

   Both back ends have the same shape, so projectSave.ts and the Projects page
   do not care which one is in use. */

import { accounts, type ProjectMeta, type ProjectSummary, type SavedProjectData } from "../api/accounts";
import { useAuth } from "../store/auth";
import { LOGIN_ENABLED } from "../config/features";

export type ProjectsWhere = "account" | "browser";

export interface ProjectsBackend {
  where: ProjectsWhere;
  list(): Promise<ProjectMeta[]>;
  get(id: string): Promise<ProjectMeta & { data: SavedProjectData }>;
  create(name: string, data: SavedProjectData, summary: ProjectSummary): Promise<{ id: string; name: string; updated_at: string }>;
  update(id: string, name: string, data: SavedProjectData, summary: ProjectSummary): Promise<{ id: string; name: string; updated_at: string }>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
}

const accountBackend: ProjectsBackend = {
  where: "account",
  list: async () => (await accounts.listProjects()).projects,
  get: (id) => accounts.getProject(id),
  create: (name, data, summary) => accounts.createProject(name, data, summary),
  update: (id, name, data, summary) => accounts.updateProject(id, name, data, summary),
  rename: async (id, name) => { await accounts.renameProject(id, name); },
  remove: async (id) => { await accounts.deleteProject(id); },
};

// ── Browser back end (IndexedDB) ─────────────────────────────────────────────
type Stored = ProjectMeta & { data: SavedProjectData };
const DB_NAME = "ppg-projects";
const STORE = "projects";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("This browser cannot store projects (IndexedDB is unavailable).")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open the browser's project storage."));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    let value: T | undefined;
    if (req) req.onsuccess = () => { value = req.result; };
    t.oncomplete = () => { db.close(); resolve(value); };
    t.onerror = () => { db.close(); reject(t.error ?? new Error("Saving in the browser failed.")); };
    t.onabort = () => { db.close(); reject(t.error ?? new Error("Saving in the browser was aborted (storage full?).")); };
  });
}

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID() : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);

const browserBackend: ProjectsBackend = {
  where: "browser",
  list: async () => {
    const all = (await tx<Stored[]>("readonly", (s) => s.getAll())) ?? [];
    return all.map(({ data: _data, ...meta }) => meta).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },
  get: async (id) => {
    const p = await tx<Stored>("readonly", (s) => s.get(id));
    if (!p) throw new Error("This project is no longer saved in this browser.");
    return p;
  },
  create: async (name, data, summary) => {
    const now = new Date().toISOString();
    const rec: Stored = { id: newId(), name, summary, data, created_at: now, updated_at: now };
    await tx("readwrite", (s) => s.put(rec));
    return { id: rec.id, name, updated_at: now };
  },
  update: async (id, name, data, summary) => {
    const prev = await tx<Stored>("readonly", (s) => s.get(id));
    const now = new Date().toISOString();
    const rec: Stored = { id, name, summary, data, created_at: prev?.created_at ?? now, updated_at: now };
    await tx("readwrite", (s) => s.put(rec));
    return { id, name, updated_at: now };
  },
  rename: async (id, name) => {
    const prev = await tx<Stored>("readonly", (s) => s.get(id));
    if (prev) await tx("readwrite", (s) => s.put({ ...prev, name, updated_at: new Date().toISOString() }));
  },
  remove: async (id) => { await tx("readwrite", (s) => s.delete(id)); },
};

/** The back end for the current user: their account when signed in, else this browser. */
export function projectsBackend(): ProjectsBackend {
  return LOGIN_ENABLED && useAuth.getState().email ? accountBackend : browserBackend;
}

/** Same choice as a React hook value, so components re-render on sign-in/out. */
export function useProjectsWhere(): ProjectsWhere {
  const email = useAuth((s) => s.email);
  return LOGIN_ENABLED && email ? "account" : "browser";
}
