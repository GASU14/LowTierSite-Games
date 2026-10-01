import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBvdsv0x7RNxnbBT5mq5poTqmQu94M573M",
  authDomain: "lowtiersite.firebaseapp.com",
  projectId: "lowtiersite",
  storageBucket: "lowtiersite.firebasestorage.app",
  messagingSenderId: "271225792815",
  appId: "1:271225792815:web:f5df066e07d46ed5f459da",
  measurementId: "G-CF2N9Z19G3"
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
