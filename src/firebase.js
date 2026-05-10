import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyD6KMPQaXFdohXEPv3CNEYoxmxlBKDL-ZU",
  authDomain: "all-rounder-mvp.firebaseapp.com",
  databaseURL: "https://all-rounder-mvp-default-rtdb.firebaseio.com",
  projectId: "all-rounder-mvp",
  storageBucket: "all-rounder-mvp.firebasestorage.app",
  messagingSenderId: "1016311617741",
  appId: "1:1016311617741:web:fa7fc195a38eb9e7993184"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
