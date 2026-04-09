import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "./firebaseClient";

class AuthService {
  constructor() {
    this.currentUser = null;
    this.unsubscribe = null;
    this.listeners = new Set();
  }

  init() {
    if (!isFirebaseConfigured || !auth) {
      console.info("[auth] init skipped (firebase not configured)");
      return;
    }
    if (this.unsubscribe) return;

    this.unsubscribe = onAuthStateChanged(auth, (user) => {
      this.currentUser = user
        ? {
            uid: user.uid,
            displayName: user.displayName || "",
            email: user.email || "",
            photoURL: user.photoURL || "",
          }
        : null;

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

  async signInWithGoogle() {
    if (!isFirebaseConfigured || !auth || !googleProvider) {
      throw new Error("Firebase 尚未設定，請先配置 VITE_FIREBASE_* 變數");
    }

    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    this.currentUser = {
      uid: user.uid,
      displayName: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
    };
    console.info("[auth] sign in success:", this.currentUser.uid);
    return this.currentUser;
  }

  async signOut() {
    if (!isFirebaseConfigured || !auth) return;
    await signOut(auth);
    this.currentUser = null;
    console.info("[auth] sign out success");
  }
}

export const authService = new AuthService();
