import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCxEZeAZujsknsan1WTYbsuCGWfDvwpL40",
  authDomain: "juschatz-8e40f.firebaseapp.com",
  projectId: "juschatz-8e40f",
  storageBucket: "juschatz-8e40f.firebasestorage.app",
  messagingSenderId: "649009177601",
  appId: "1:649009177601:web:placeholder" // User will need to update this from console
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
