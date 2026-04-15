import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "./firebaseClient";

class AuthService {
  constructor() {
    this.currentUser = null;
    this.unsubscribe = null;
    this.listeners = new Set();
    this.redirectResultHandled = false;
  }

  toSafeUser(user) {
    if (!user) return null;
    return {
      uid: user.uid,
      displayName: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
    };
  }

  normalizeFirebaseError(err) {
    const code = String(err?.code || "");
    const message = String(err?.message || "");
    return { code, message, raw: err };
  }

  shouldFallbackToRedirect(errorCode, options = {}) {
    const allowPopupClosedFallback = options.allowPopupClosedFallback !== false;
    return [
      "auth/popup-blocked",
      "auth/cancelled-popup-request",
      "auth/operation-not-supported-in-this-environment",
      "auth/unauthorized-domain",
      ...(allowPopupClosedFallback ? ["auth/popup-closed-by-user"] : []),
    ].includes(errorCode);
  }

  async handleRedirectResultOnce() {
    if (this.redirectResultHandled || !isFirebaseConfigured || !auth) return;
    this.redirectResultHandled = true;

    try {
      const result = await getRedirectResult(auth);
      if (result?.user) {
        this.currentUser = this.toSafeUser(result.user);
        console.info("[auth] redirect sign in success:", this.currentUser.uid);
      }
    } catch (err) {
      const { code, message } = this.normalizeFirebaseError(err);
      console.error("[auth] redirect result failed:", code || message || err);
    }
  }

  init() {
    if (!isFirebaseConfigured || !auth) {
      console.info("[auth] init skipped (firebase not configured)");
      return;
    }
    if (this.unsubscribe) return;

    void this.handleRedirectResultOnce();

    this.unsubscribe = onAuthStateChanged(auth, (user) => {
      this.currentUser = this.toSafeUser(user);

      console.info("[auth] state changed:", this.currentUser?.uid || "anonymous");
      this.listeners.forEach((cb) => {
        try {
          cb(this.currentUser);
        } catch (err) {
          console.error("[auth] listener error:", err);
        }
      });
    });
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getCurrentUser() {
    return this.currentUser;
  }

  isConfigured() {
    return isFirebaseConfigured;
  }

  async signInWithGoogle(options = {}) {
    if (!isFirebaseConfigured || !auth || !googleProvider) {
      throw new Error("Firebase 尚未設定，請先配置 VITE_FIREBASE_* 變數");
    }

    const preferRedirect = !!options.preferRedirect;

    if (preferRedirect) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      this.currentUser = this.toSafeUser(user);
      console.info("[auth] sign in success:", this.currentUser.uid);
      return this.currentUser;
    } catch (err) {
      const { code, message, raw } = this.normalizeFirebaseError(err);

      if (this.shouldFallbackToRedirect(code)) {
        console.warn(`[auth] popup failed (${code || "unknown"}), fallback to redirect.`);
        await signInWithRedirect(auth, googleProvider);
        return null;
      }

      if (code === "auth/popup-closed-by-user") {
        throw new Error("您已關閉登入視窗，請再試一次。");
      }

      throw new Error(message || String(raw || "Google 登入失敗"));
    }
  }

  async signOut() {
    if (!isFirebaseConfigured || !auth) return;
    await signOut(auth);
    this.currentUser = null;
    console.info("[auth] sign out success");
  }
}

export const authService = new AuthService();
