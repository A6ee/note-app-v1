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

function normalizeQuestionText(v) {
  return String(v || "").trim();
}

function normalizeOptionList(options) {
  return Array.isArray(options) ? options.map((o) => String(o || "")) : [];
}

function buildWrongQuestionId(item) {
  const q = normalizeQuestionText(item?.question);
  const t = String(item?.type || "").trim();
  const options = normalizeOptionList(item?.options);
  return `${t}::${q}::${JSON.stringify(options)}`;
}

class LearningSyncService {
  normalizeQuizHistoryItem(item, userId) {
    return {
      id: String(item?.id || ""),
      userId,
      noteId: String(item?.noteId || ""),
      category: String(item?.category || "ºî¦X½Æ²ß"),
      type: String(item?.type || "mc"),
      isCorrect: !!item?.isCorrect,
      timestamp: toMillis(item?.timestamp, Date.now()),
      updatedAt: toMillis(item?.updatedAt, Date.now()),
    };
  }

  normalizeWrongQuestionItem(item, userId) {
    const now = Date.now();
    const normalized = {
      id: String(item?.id || buildWrongQuestionId(item)),
      userId,
      question: normalizeQuestionText(item?.question),
      options: normalizeOptionList(item?.options),
      answer: item?.answer,
      type: String(item?.type || "mc"),
      level: Math.max(1, Number(item?.level || 1)),
      nextReviewTime: toMillis(item?.nextReviewTime, now),
      updatedAt: toMillis(item?.updatedAt, now),
    };
    return normalized;
  }

  async fetchCloudLearning(userId) {
    if (!isFirebaseConfigured || !db || !userId) {
      return { quizHistory: [], wrongQuestions: [] };
    }

    const historyRef = collection(db, "users", userId, "learning_quiz_history");
    const wrongRef = collection(db, "users", userId, "learning_wrong_questions");

    const [historySnap, wrongSnap] = await Promise.all([
      getDocs(historyRef),
      getDocs(wrongRef),
    ]);

    const quizHistory = historySnap.docs.map((d) => d.data());
    const wrongQuestions = wrongSnap.docs.map((d) => d.data());

    console.info(
      `[learning-sync] fetched cloud learning: history=${quizHistory.length}, wrong=${wrongQuestions.length}`,
    );

    return { quizHistory, wrongQuestions };
  }

  mergeQuizHistory(localHistory, cloudHistory) {
    const mergedMap = new Map();

    for (const item of cloudHistory || []) {
      if (!item?.id) continue;
      mergedMap.set(item.id, item);
    }

    for (const item of localHistory || []) {
      if (!item?.id) continue;
      const cloud = mergedMap.get(item.id);
      if (!cloud) {
        mergedMap.set(item.id, item);
        continue;
      }

      const localTs = toMillis(item.updatedAt || item.timestamp, 0);
      const cloudTs = toMillis(cloud.updatedAt || cloud.timestamp, 0);
      mergedMap.set(item.id, localTs >= cloudTs ? item : cloud);
    }

    return Array.from(mergedMap.values()).sort(
      (a, b) => toMillis(b.timestamp, 0) - toMillis(a.timestamp, 0),
    );
  }

  mergeWrongQuestions(localWrong, cloudWrong) {
    const mergedMap = new Map();

    for (const item of cloudWrong || []) {
      const key = item?.id || buildWrongQuestionId(item);
      if (!key) continue;
      mergedMap.set(key, item);
    }

    for (const item of localWrong || []) {
      const key = item?.id || buildWrongQuestionId(item);
      if (!key) continue;

      const cloud = mergedMap.get(key);
      if (!cloud) {
        mergedMap.set(key, item);
        continue;
      }

      const localTs = toMillis(item.updatedAt || item.nextReviewTime, 0);
      const cloudTs = toMillis(cloud.updatedAt || cloud.nextReviewTime, 0);
      mergedMap.set(key, localTs >= cloudTs ? item : cloud);
    }

    return Array.from(mergedMap.values()).sort(
      (a, b) => toMillis(a.nextReviewTime, 0) - toMillis(b.nextReviewTime, 0),
    );
  }

  async upsertCloudQuizHistoryItem(userId, item) {
    if (!isFirebaseConfigured || !db || !userId) return;
    const normalized = this.normalizeQuizHistoryItem(item, userId);
    if (!normalized.id) return;

    const ref = doc(db, "users", userId, "learning_quiz_history", normalized.id);
    await setDoc(ref, normalized, { merge: true });
  }

  async upsertCloudWrongQuestionItem(userId, item) {
    if (!isFirebaseConfigured || !db || !userId) return;
    const normalized = this.normalizeWrongQuestionItem(item, userId);
    if (!normalized.id) return;

    const ref = doc(db, "users", userId, "learning_wrong_questions", normalized.id);
    await setDoc(ref, normalized, { merge: true });
  }

  async clearCloudQuizHistory(userId) {
    if (!isFirebaseConfigured || !db || !userId) return;
    const historyRef = collection(db, "users", userId, "learning_quiz_history");
    const snap = await getDocs(historyRef);

    await Promise.all(
      snap.docs.map((item) => deleteDoc(doc(db, "users", userId, "learning_quiz_history", item.id))),
    );
    console.info(`[learning-sync] cleared cloud quiz history: ${snap.docs.length}`);
  }

  async syncPendingQueue(userId) {
    if (!isFirebaseConfigured || !db || !userId) return;

    const queue = await storageService.getLearningPendingQueue();
    if (!queue.length) return;

    const remains = [];

    for (const item of queue) {
      try {
        if (item.entityType === "quizHistory") {
          await this.upsertCloudQuizHistoryItem(userId, {
            ...(item.payload || {}),
            id: item.entityId,
            updatedAt: item.updatedAt || Date.now(),
          });
        } else if (item.entityType === "wrongQuestion") {
          await this.upsertCloudWrongQuestionItem(userId, {
            ...(item.payload || {}),
            id: item.entityId,
            updatedAt: item.updatedAt || Date.now(),
          });
        } else {
          remains.push(item);
          continue;
        }
      } catch (err) {
        const retryCount = Number(item.retryCount || 0) + 1;
        console.warn(
          "[learning-queue] sync failed:",
          item.op,
          item.entityType,
          item.entityId,
          err,
        );
        remains.push({ ...item, retryCount });
      }
    }

    await storageService.saveLearningPendingQueue(remains);
    if (remains.length) {
      console.warn(`[learning-queue] remains after retry: ${remains.length}`);
    }
  }
}

export const learningSyncService = new LearningSyncService();
