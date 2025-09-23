// Pega tu configuración de Firebase aquí:
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-database.js";
const firebaseConfig = {
  apiKey: "AIzaSyBr7rSwZ83tpGnd03HjsvLamiIOHAYjMpg",
  authDomain: "impostor-28760.firebaseapp.com",
  databaseURL: "https://impostor-28760-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "impostor-28760",
  storageBucket: "impostor-28760.firebasestorage.app",
  messagingSenderId: "824728858387",
  appId: "1:824728858387:web:afa37e0e3b0685784834e6",
  measurementId: "G-DPBHZ0GT2N"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

