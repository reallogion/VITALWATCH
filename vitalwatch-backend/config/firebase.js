// Firebase is optional. Without credentials the server runs in memory only.
let db = null;

try {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    const admin = require("firebase-admin");
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
    db = admin.firestore();
    console.log("[firebase] connected:", FIREBASE_PROJECT_ID);
  } else {
    console.log("[firebase] no credentials in .env, running in memory only");
  }
} catch (err) {
  console.error("[firebase] init failed, running in memory only:", err.message);
  db = null;
}

module.exports = db;
