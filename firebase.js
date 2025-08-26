// Pega tu configuración de Firebase aquí:
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-database.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAz7XbgGIwRvRPmCRrCRrL5KavwBZRLGso",
  authDomain: "impostor-28760.firebaseapp.com",
  databaseURL: "https://impostor-28760-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "impostor-28760",
  storageBucket: "impostor-28760.appspot.com",
  messagingSenderId: "ID",
  appId: "APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
