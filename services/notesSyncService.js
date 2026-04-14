import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebaseClient";
import { storageService } from "./storageService";

function toMillis(v, fallback = 0) {
  if (!v) return fallback;
  if (typeof v === "number") return v;
  const n = Number(v);
  if (!Number.isNaN(n) && Number.isFinite(n)) return n;
  const d = new Date(v).getTime();
  return Number.isNaN(d) ? fallback : d;
}

class NotesSyncService {
  normalizeNote(note, userId) {
    const now = Date.now();
    return {
      id: note.id,
      userId,
      title: note.title || "未命名筆記",
      intro: note.intro || "",
      date: note.date || `${new Date().getMonth() + 1} / ${new Date().getDate()}`,
      duration: note.duration || "00:00",
      category: note.category || "未分類",
      sections: Array.isArray(note.sections) ? note.sections : [],
      segments: Array.isArray(note.segments) ? note.segments : [],
      isFavorite: !!note.isFavorite,
      isDeleted: !!note.isDeleted,
      deletedAt: note.deletedAt || null,
      createdAt: toMillis(note.createdAt, now),
      updatedAt: toMillis(note.updatedAt, now),
    };
  }

  async fetchCloudNotes(userId) {
    if (!isFirebaseConfigured || !db || !userId) return [];

    const ref = collection(db, "users", userId, "notes");
    const snap = await getDocs(ref);
    const notes = snap.docs.map((d) => d.data());
    console.info(`[sync] fetched cloud notes: ${notes.length}`);
    return notes;
  }

  mergeNotes(localNotes, cloudNotes) {
    const mergedMap = new Map();

    for (const note of cloudNotes || []) {
      mergedMap.set(note.id, note);
    }

    for (const local of localNotes || []) {
      const cloud = mergedMap.get(local.id);
      if (!cloud) {
        mergedMap.set(local.id, local);
        continue;
      }

      const localTs = toMillis(local.updatedAt, 0);
      const cloudTs = toMillis(cloud.updatedAt, 0);
      mergedMap.set(local.id, localTs >= cloudTs ? local : cloud);
    }

    const merged = Array.from(mergedMap.values()).sort(
      (a, b) => toMillis(b.updatedAt, 0) - toMillis(a.updatedAt, 0),
    );

    console.info(
      `[merge] local=${localNotes.length}, cloud=${cloudNotes.length}, merged=${merged.length}`,
    );
    return merged;
  }

  async upsertCloudNote(userId, note) {
    if (!isFirebaseConfigured || !db || !userId) return;
    const normalized = this.normalizeNote(note, userId);
    const ref = doc(db, "users", userId, "notes", normalized.id);
    await setDoc(ref, normalized, { merge: true });
    console.info("[sync] upsert cloud note:", normalized.id);
  }

  async deleteCloudNote(userId, noteId) {
    if (!isFirebaseConfigured || !db || !userId || !noteId) return;
    const ref = doc(db, "users", userId, "notes", noteId);
    await deleteDoc(ref);
    console.info("[sync] hard delete cloud note:", noteId);
  }

  async clearCloudNotes(userId) {
    if (!isFirebaseConfigured || !db || !userId) return;

    const ref = collection(db, "users", userId, "notes");
    const snap = await getDocs(ref);
    await Promise.all(
      snap.docs.map((item) => deleteDoc(doc(db, "users", userId, "notes", item.id))),
    );

    console.info(`[sync] cleared cloud notes: ${snap.docs.length}`);
  }

  async syncPendingQueue(userId) {
    if (!isFirebaseConfigured || !db || !userId) return;

    const queue = await storageService.getPendingQueue();
    if (!queue.length) return;

    const remains = [];
    for (const item of queue) {
      try {
        if (item.entityType !== "note") {
          remains.push(item);
          continue;
        }

        if (item.op === "delete") {
          await this.deleteCloudNote(userId, item.entityId);
        } else {
          await this.upsertCloudNote(userId, {
            ...(item.payload || {}),
            id: item.entityId,
            updatedAt: item.updatedAt || Date.now(),
          });
        }

        console.info("[queue] sync success:", item.op, item.entityId);
      } catch (err) {
        const retryCount = Number(item.retryCount || 0) + 1;
        console.warn("[queue] sync failed:", item.op, item.entityId, err);
        remains.push({ ...item, retryCount });
      }
    }

    await storageService.savePendingQueue(remains);
    if (remains.length) {
      console.warn(`[queue] remains after retry: ${remains.length}`);
    }
  }
}

export const notesSyncService = new NotesSyncService();
