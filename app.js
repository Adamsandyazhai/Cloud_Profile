const express = require("express");
const multer = require("multer");
const bodyParser = require("body-parser");
const cors = require("cors");
const firebaseAdmin = require("firebase-admin");
const fs = require("fs");

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

const serviceAccount = require("./serviceAccountKey.json");

firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
  storageBucket: "nutripal-4bd4e.firebasestorage.app",
});

const bucket = firebaseAdmin.storage().bucket();
const db = firebaseAdmin.firestore();
const upload = multer({ dest: "temp/" });

// Function to get a Firebase User from UID
async function getFirebaseUser(uid) {
  try {
    const userRecord = await firebaseAdmin.auth().getUser(uid);
    return userRecord; // If the user exists, return user data
  } catch (error) {
    return null; // Return null if user does not exist
  }
}

// Function to upload file to Firebase Storage
async function uploadToFirebase(file) {
  const destination = `profile-pictures/${Date.now()}-${file.originalname}`;
  const [uploadedFile] = await bucket.upload(file.path, {
    destination,
    metadata: {
      contentType: file.mimetype,
    },
  });

  fs.unlinkSync(file.path);

  return `https://storage.googleapis.com/${bucket.name}/${uploadedFile.name}`;
}

// Function to delete file from Firebase Storage
async function deleteFromFirebase(filename) {
  const file = bucket.file(filename);
  try {
    await file.delete();
    console.log(`File ${filename} deleted successfully.`);
  } catch (error) {
    console.error(`Error deleting file ${filename}:`, error);
  }
}

// Endpoint to get the profile of a user
app.get("/profile/:uid", async (req, res) => {
  try {
    const requestedUid = req.params.uid;

    // Validate the UID by checking if the user exists in Firebase Auth
    const user = await getFirebaseUser(requestedUid);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const doc = await db.collection("profiles").doc(requestedUid).get();

    if (!doc.exists) {
      return res.status(404).json({ message: "Profile not found" });
    }

    res.json(doc.data());
  } catch (error) {
    res.status(500).json({ message: "Error fetching profile", error });
  }
});

// Endpoint to create a profile
app.post("/profile", upload.single("profilePicture"), async (req, res) => {
  try {
    const { uid, name, gender, lifestyle } = req.body;

    // Validate the UID by checking if the user exists in Firebase Auth
    const user = await getFirebaseUser(uid);

    if (!user) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    // Use UID as the unique identifier
    let profilePicture = null;

    if (req.file) {
      profilePicture = await uploadToFirebase(req.file);
    }

    const profile = {
      uid,
      name,
      gender,
      lifestyle,
      profilePicture,
    };

    // Save the profile using UID as document ID
    await db.collection("profiles").doc(uid).set(profile);

    res.status(201).json({
      message: "Profile created successfully",
      profile,
    });
  } catch (error) {
    res.status(500).json({ message: "Error creating profile", error });
  }
});

// Endpoint to update a profile
// Endpoint untuk memperbarui profil pengguna
app.put("/profile/:uid", upload.single("profilePicture"), async (req, res) => {
  try {
    const requestedUid = req.params.uid;

    // Validasi UID: cek apakah UID ada di Firebase Authentication
    const user = await getFirebaseUser(requestedUid);

    if (!user) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    const doc = await db.collection("profiles").doc(requestedUid).get();

    if (!doc.exists) {
      return res.status(404).json({ message: "Profile not found" });
    }

    const { name, gender, lifestyle } = req.body;

    const currentProfile = doc.data();
    let profilePicture = currentProfile.profilePicture;

    // Cek apakah ada foto profil baru yang diunggah
    if (req.file) {
      // Jika ada foto profil lama, hapus dulu dari Firebase Storage
      if (profilePicture) {
        const oldFilename = profilePicture.split("/").pop(); // Ambil nama file
        await deleteFromFirebase(`profile-pictures/${oldFilename}`);
      }

      // Upload foto profil baru ke Firebase Storage
      profilePicture = await uploadToFirebase(req.file);
    }

    // Update profil dengan data baru
    const updatedProfile = {
      ...currentProfile,
      name: name || currentProfile.name,
      gender: gender || currentProfile.gender,
      lifestyle: lifestyle || currentProfile.lifestyle,
      profilePicture,
    };

    // Simpan update profil di Firestore
    await db.collection("profiles").doc(requestedUid).set(updatedProfile);

    res.json({
      message: "Profile updated successfully",
      profile: updatedProfile,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating profile", error });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});