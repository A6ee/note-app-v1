import localforage from "localforage";

export const STORAGE_KEYS = {
  NOTES: "president_notes",
  SETTINGS: "president_settings",
  QUIZ_HISTORY: "president_quiz_history",
  WRONG_QUESTIONS: "president_wrong_questions",
  TEMP_TRANSCRIPT: "temp_transcript",
  NOTES_PENDING_QUEUE: "notes_sync_pending_queue_v1",
};

class StorageService {
  constructor() {
    this.storage = localforage.createInstance({
      name: "MemorAIze",
      storeName: "app_state",
    });
  }

  parseJsonSafe(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error("[storage] parse json failed:", err);
      return fallback;
    }
  }

  async getWithLegacyFallback(key, fallback, parser = (v) => v) {
    const value = await this.storage.getItem(key);
    if (value !== null && value !== undefined) return value;

    const legacyRaw = localStorage.getItem(key);
    if (legacyRaw === null) return fallback;

    const legacyValue = parser(legacyRaw);
    await this.storage.setItem(key, legacyValue);
    localStorage.removeItem(key);
    console.info(`[storage] migrated legacy key: ${key}`);
    return legacyValue;
  }

  async set(key, value) {
    await this.storage.setItem(key, value);
  }

  async remove(key) {
    await this.storage.removeItem(key);
  }

  async getNotes(defaultNotes) {
    return this.getWithLegacyFallback(
      STORAGE_KEYS.NOTES,
      defaultNotes,
      (raw) => this.parseJsonSafe(raw, defaultNotes),
    );
  }

  async saveNotes(notes) {
    await this.set(STORAGE_KEYS.NOTES, notes);
  }

  async getPendingQueue() {
    return this.getWithLegacyFallback(
      STORAGE_KEYS.NOTES_PENDING_QUEUE,
      [],
      (raw) => this.parseJsonSafe(raw, []),
    );
  }

  async savePendingQueue(queue) {
    await this.set(STORAGE_KEYS.NOTES_PENDING_QUEUE, queue);
  }

  async enqueueNoteOp(item) {
    const queue = await this.getPendingQueue();
    queue.push(item);
    await this.savePendingQueue(queue);
    console.info("[queue] enqueue:", item.op, item.entityId);
  }
}

export const storageService = new StorageService();
