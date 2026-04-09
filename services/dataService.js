import { authService } from "./authService";
import { notesSyncService } from "./notesSyncService";
import { storageService } from "./storageService";

function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableString(value) {
  return JSON.stringify(value);
}

class DataService {
  constructor() {
    this.notesCache = [];
    this.notesListeners = new Set();
    this.syncInFlight = false;
    this.isReady = false;
  }

  async init(defaultNotes) {
    authService.init();

    const fallback = cloneDeep(defaultNotes || []);
    const localNotes = await storageService.getNotes(fallback);
    this.notesCache = Array.isArray(localNotes) && localNotes.length
      ? localNotes
      : fallback;
    this.isReady = true;
    this.emitNotesChanged();

    authService.onChange(async (user) => {
      console.info("[dataService] auth changed, user:", user?.uid || "anonymous");
      if (user?.uid) {
        await this.syncNotesIfNeeded();
      }
    });

    const user = authService.getCurrentUser();
    if (user?.uid) {
      await this.syncNotesIfNeeded();
    }

    return this.getNotes();
  }

  onNotesChanged(callback) {
    this.notesListeners.add(callback);
    return () => this.notesListeners.delete(callback);
  }

  emitNotesChanged() {
    const payload = this.getNotes();
    this.notesListeners.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.error("[dataService] onNotesChanged callback failed:", err);
      }
    });
  }

  getCurrentUser() {
    return authService.getCurrentUser();
  }

  async signInWithGoogle() {
    const user = await authService.signInWithGoogle();
    await this.syncNotesIfNeeded();
    return user;
  }

  async signOut() {
    await authService.signOut();
  }

  getNotes() {
    return cloneDeep(this.notesCache);
  }

  async persistNotesSnapshot(nextNotes) {
    const normalized = Array.isArray(nextNotes) ? nextNotes : [];
    const prevMap = new Map((this.notesCache || []).map((n) => [n.id, n]));
    const nextMap = new Map(normalized.map((n) => [n.id, n]));

    for (const [id, note] of nextMap.entries()) {
      const prev = prevMap.get(id);
      if (!prev) {
        await this.enqueueOp("create", note);
        continue;
      }

      if (stableString(prev) !== stableString(note)) {
        await this.enqueueOp("update", note);
      }
    }

    for (const [id, prev] of prevMap.entries()) {
      if (!nextMap.has(id)) {
        await this.enqueueOp("delete", prev);
      }
    }

    this.notesCache = cloneDeep(normalized);
    await storageService.saveNotes(this.notesCache);
    this.emitNotesChanged();

    await this.syncNotesIfNeeded();
    return this.getNotes();
  }

  async createNote(note) {
    const now = Date.now();
    const payload = {
      ...note,
      id: note.id || now.toString(),
      createdAt: note.createdAt || now,
      updatedAt: now,
    };
    const next = [payload, ...this.notesCache];
    return this.persistNotesSnapshot(next);
  }

  async updateNote(note) {
    const now = Date.now();
    const next = this.notesCache.map((n) =>
      n.id === note.id ? { ...n, ...note, updatedAt: now } : n,
    );
    return this.persistNotesSnapshot(next);
  }

  async deleteNote(noteId) {
    const now = Date.now();
    const next = this.notesCache.map((n) =>
      n.id === noteId ? { ...n, isDeleted: true, deletedAt: now, updatedAt: now } : n,
    );
    return this.persistNotesSnapshot(next);
  }

  async enqueueOp(op, note) {
    const user = this.getCurrentUser();
    if (!user?.uid) return;

    const item = {
      op,
      entityType: "note",
      entityId: note.id,
      payload: note,
      updatedAt: note.updatedAt || Date.now(),
      retryCount: 0,
    };
    await storageService.enqueueNoteOp(item);
  }

  async syncNotesIfNeeded() {
    if (this.syncInFlight) return;

    const user = this.getCurrentUser();
    if (!user?.uid) {
      console.info("[dataService] sync skipped (anonymous)");
      return;
    }

    this.syncInFlight = true;
    try {
      const cloudNotes = await notesSyncService.fetchCloudNotes(user.uid);
      const merged = notesSyncService.mergeNotes(this.notesCache, cloudNotes);
      this.notesCache = merged;
      await storageService.saveNotes(this.notesCache);
      this.emitNotesChanged();

      for (const note of merged) {
        const cloudNote = (cloudNotes || []).find((n) => n.id === note.id);
        const cloudUpdatedAt = Number(cloudNote?.updatedAt || 0);
        const localUpdatedAt = Number(note?.updatedAt || 0);
        if (!cloudNote || localUpdatedAt > cloudUpdatedAt) {
          await notesSyncService.upsertCloudNote(user.uid, note);
        }
      }

      await notesSyncService.syncPendingQueue(user.uid);
      console.info("[dataService] sync completed");
    } catch (err) {
      console.error("[dataService] sync failed:", err);
    } finally {
      this.syncInFlight = false;
    }
  }
}

export const dataService = new DataService();
