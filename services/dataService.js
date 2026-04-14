import { authService } from "./authService";
import { learningSyncService } from "./learningSyncService";
import { notesSyncService } from "./notesSyncService";
import { storageService } from "./storageService";

function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableString(value) {
  return JSON.stringify(value);
}

function toMillis(v, fallback = 0) {
  if (!v) return fallback;
  if (typeof v === "number") return v;
  const n = Number(v);
  if (!Number.isNaN(n) && Number.isFinite(n)) return n;
  const d = new Date(v).getTime();
  return Number.isNaN(d) ? fallback : d;
}

function normalizeOptionList(options) {
  return Array.isArray(options) ? options.map((o) => String(o || "")) : [];
}

function buildWrongQuestionId(item) {
  const q = String(item?.question || "").trim();
  const t = String(item?.type || "").trim();
  const options = normalizeOptionList(item?.options);
  return `${t}::${q}::${JSON.stringify(options)}`;
}

function buildQuizHistoryId(item) {
  const timestamp = toMillis(item?.timestamp, 0);
  const noteId = String(item?.noteId || "smart-review");
  const type = String(item?.type || "mc");
  const isCorrect = item?.isCorrect ? "1" : "0";
  return `${timestamp}::${noteId}::${type}::${isCorrect}`;
}

class DataService {
  constructor() {
    this.notesCache = [];
    this.quizHistoryCache = [];
    this.wrongQuestionsCache = [];
    this.notesListeners = new Set();
    this.learningListeners = new Set();
    this.syncInFlight = false;
    this.learningSyncInFlight = false;
    this.isReady = false;
  }

  async init(defaultNotes) {
    authService.init();

    const fallback = cloneDeep(defaultNotes || []);
    const localNotes = await storageService.getNotes(fallback);
    const localQuizHistory = await storageService.getQuizHistory([]);
    const localWrongQuestions = await storageService.getWrongQuestions([]);

    this.notesCache = Array.isArray(localNotes) && localNotes.length
      ? localNotes
      : fallback;
    this.quizHistoryCache = this.normalizeQuizHistory(localQuizHistory);
    this.wrongQuestionsCache = this.normalizeWrongQuestions(localWrongQuestions);
    this.isReady = true;
    this.emitNotesChanged();
    this.emitLearningChanged();

    authService.onChange(async (user) => {
      console.info("[dataService] auth changed, user:", user?.uid || "anonymous");
      if (user?.uid) {
        await this.syncNotesIfNeeded();
        await this.syncLearningIfNeeded();
      }
    });

    const user = authService.getCurrentUser();
    if (user?.uid) {
      await this.syncNotesIfNeeded();
      await this.syncLearningIfNeeded();
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

  onLearningChanged(callback) {
    this.learningListeners.add(callback);
    return () => this.learningListeners.delete(callback);
  }

  emitLearningChanged() {
    const payload = {
      quizHistory: this.getQuizHistory(),
      wrongQuestions: this.getWrongQuestions(),
    };
    this.learningListeners.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.error("[dataService] onLearningChanged callback failed:", err);
      }
    });
  }

  getCurrentUser() {
    return authService.getCurrentUser();
  }

  async signInWithGoogle() {
    const user = await authService.signInWithGoogle();
    await this.syncNotesIfNeeded();
    await this.syncLearningIfNeeded();
    return user;
  }

  async signOut() {
    await authService.signOut();
  }

  async clearCloudNotesIfSignedIn() {
    const user = this.getCurrentUser();
    if (!user?.uid) return;
    await notesSyncService.clearCloudNotes(user.uid);
  }

  getNotes() {
    return cloneDeep(this.notesCache);
  }

  normalizeQuizHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
      .map((item) => {
        const timestamp = toMillis(item?.timestamp, Date.now());
        return {
          id: String(item?.id || buildQuizHistoryId(item)),
          noteId: String(item?.noteId || "smart-review"),
          category: String(item?.category || "綜合複習"),
          type: String(item?.type || "mc"),
          isCorrect: !!item?.isCorrect,
          timestamp,
          updatedAt: toMillis(item?.updatedAt, timestamp),
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  normalizeWrongQuestions(wrongQuestions) {
    if (!Array.isArray(wrongQuestions)) return [];
    return wrongQuestions
      .map((item) => {
        const now = Date.now();
        const id = String(item?.id || buildWrongQuestionId(item));
        return {
          id,
          question: String(item?.question || "").trim(),
          options: normalizeOptionList(item?.options),
          answer: item?.answer,
          type: String(item?.type || "mc"),
          level: Math.max(1, Number(item?.level || 1)),
          nextReviewTime: toMillis(item?.nextReviewTime, now),
          updatedAt: toMillis(item?.updatedAt, now),
        };
      })
      .filter((item) => !!item.id)
      .sort((a, b) => a.nextReviewTime - b.nextReviewTime);
  }

  getQuizHistory() {
    return cloneDeep(this.quizHistoryCache);
  }

  getWrongQuestions() {
    return cloneDeep(this.wrongQuestionsCache);
  }

  async persistQuizHistory(nextQuizHistory) {
    const normalized = this.normalizeQuizHistory(nextQuizHistory);
    const prevMap = new Map((this.quizHistoryCache || []).map((q) => [q.id, q]));

    this.quizHistoryCache = cloneDeep(normalized);
    await storageService.saveQuizHistory(this.quizHistoryCache);
    this.emitLearningChanged();

    for (const item of normalized) {
      const prev = prevMap.get(item.id);
      if (!prev || stableString(prev) !== stableString(item)) {
        await this.enqueueLearningOp("upsert", "quizHistory", item.id, item);
      }
    }

    await this.syncLearningIfNeeded();
    return this.getQuizHistory();
  }

  async addQuizRecord(record) {
    const now = Date.now();
    const item = {
      id: record?.id || `${now}-${Math.random().toString(36).slice(2, 8)}`,
      noteId: record?.noteId || "smart-review",
      category: record?.category || "綜合複習",
      type: record?.type || "mc",
      isCorrect: !!record?.isCorrect,
      timestamp: toMillis(record?.timestamp, now),
      updatedAt: now,
    };
    const next = [item, ...this.quizHistoryCache];
    return this.persistQuizHistory(next);
  }

  async clearQuizHistory() {
    this.quizHistoryCache = [];
    await storageService.saveQuizHistory([]);
    this.emitLearningChanged();

    const user = this.getCurrentUser();
    if (user?.uid) {
      await learningSyncService.clearCloudQuizHistory(user.uid);
    }
  }

  async persistWrongQuestions(nextWrongQuestions) {
    const normalized = this.normalizeWrongQuestions(nextWrongQuestions);
    const prevMap = new Map((this.wrongQuestionsCache || []).map((q) => [q.id, q]));

    this.wrongQuestionsCache = cloneDeep(normalized);
    await storageService.saveWrongQuestions(this.wrongQuestionsCache);
    this.emitLearningChanged();

    for (const item of normalized) {
      const prev = prevMap.get(item.id);
      if (!prev || stableString(prev) !== stableString(item)) {
        await this.enqueueLearningOp("upsert", "wrongQuestion", item.id, item);
      }
    }

    await this.syncLearningIfNeeded();
    return this.getWrongQuestions();
  }

  async upsertWrongQuestion(item) {
    const nextItem = {
      ...item,
      id: item?.id || buildWrongQuestionId(item),
      updatedAt: Date.now(),
    };

    const map = new Map((this.wrongQuestionsCache || []).map((q) => [q.id, q]));
    map.set(nextItem.id, { ...(map.get(nextItem.id) || {}), ...nextItem });

    return this.persistWrongQuestions(Array.from(map.values()));
  }

  async removeWrongQuestion(id) {
    const next = (this.wrongQuestionsCache || []).filter((q) => q.id !== id);
    this.wrongQuestionsCache = cloneDeep(next);
    await storageService.saveWrongQuestions(this.wrongQuestionsCache);
    this.emitLearningChanged();
  }

  async enqueueLearningOp(op, entityType, entityId, payload) {
    const user = this.getCurrentUser();
    if (!user?.uid) return;

    const item = {
      op,
      entityType,
      entityId,
      payload,
      updatedAt: payload?.updatedAt || Date.now(),
      retryCount: 0,
    };
    await storageService.enqueueLearningOp(item);
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

  async syncLearningIfNeeded() {
    if (this.learningSyncInFlight) return;

    const user = this.getCurrentUser();
    if (!user?.uid) {
      console.info("[dataService] learning sync skipped (anonymous)");
      return;
    }

    this.learningSyncInFlight = true;
    try {
      const cloud = await learningSyncService.fetchCloudLearning(user.uid);
      const mergedQuizHistory = learningSyncService.mergeQuizHistory(
        this.quizHistoryCache,
        cloud.quizHistory || [],
      );
      const mergedWrongQuestions = learningSyncService.mergeWrongQuestions(
        this.wrongQuestionsCache,
        cloud.wrongQuestions || [],
      );

      this.quizHistoryCache = this.normalizeQuizHistory(mergedQuizHistory);
      this.wrongQuestionsCache = this.normalizeWrongQuestions(mergedWrongQuestions);

      await Promise.all([
        storageService.saveQuizHistory(this.quizHistoryCache),
        storageService.saveWrongQuestions(this.wrongQuestionsCache),
      ]);
      this.emitLearningChanged();

      const cloudQuizMap = new Map((cloud.quizHistory || []).map((q) => [q.id, q]));
      for (const item of this.quizHistoryCache) {
        const remote = cloudQuizMap.get(item.id);
        const cloudTs = toMillis(remote?.updatedAt || remote?.timestamp, 0);
        const localTs = toMillis(item.updatedAt || item.timestamp, 0);
        if (!remote || localTs > cloudTs) {
          await learningSyncService.upsertCloudQuizHistoryItem(user.uid, item);
        }
      }

      const cloudWrongMap = new Map(
        (cloud.wrongQuestions || []).map((q) => [q.id || buildWrongQuestionId(q), q]),
      );
      for (const item of this.wrongQuestionsCache) {
        const remote = cloudWrongMap.get(item.id);
        const cloudTs = toMillis(remote?.updatedAt || remote?.nextReviewTime, 0);
        const localTs = toMillis(item.updatedAt || item.nextReviewTime, 0);
        if (!remote || localTs > cloudTs) {
          await learningSyncService.upsertCloudWrongQuestionItem(user.uid, item);
        }
      }

      await learningSyncService.syncPendingQueue(user.uid);
      console.info("[dataService] learning sync completed");
    } catch (err) {
      console.error("[dataService] learning sync failed:", err);
    } finally {
      this.learningSyncInFlight = false;
    }
  }
}

export const dataService = new DataService();
