// --- 1. FIREBASE ROUTING ARCHITECTURE ---
const firebaseConfig = {
    apiKey: "AIzaSyB57PcjYtWktsOGKFLQmWX-Nc6HtYeZxp8",
    authDomain: "studyspace-f6e22.firebaseapp.com",
    projectId: "studyspace-f6e22",
    storageBucket: "studyspace-f6e22.firebasestorage.app",
    messagingSenderId: "498741408880",
    appId: "1:498741408880:web:bd5fdea00d10e9329130b5",
    measurementId: "G-J1X8Y7KDQV"
};

// Initialize compatibility instances 
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.querySelector("form");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const submitBtn = document.querySelector(".btn-submit");

    // --- 2. AUXILIARY UTILITY GENERATORS ---
    // Generates a random Discord-style unique layout handle
    function generateUniqueUsername(email) {
        const prefix = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
        const discriminator = Math.floor(1000 + Math.random() * 9000);
        return `${prefix}#${discriminator}`;
    }

    // Sorts new profiles randomly into a House room
    function sortRandomHouse() {
        const houses = ["Gryffindor", "Ravenclaw", "Hufflepuff", "Slytherin"];
        return houses[Math.floor(Math.random() * houses.length)];
    }

    // --- 3. AUTHENTICATION & REGISTRATION PIPELINE ---
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();
            
            submitBtn.innerText = "CASTING SPELL...";
            submitBtn.disabled = true;

            try {
                // Look up if a record tracking this email exists in Firestore collection
                const userSnapshot = await db.collection("users")
                    .where("email", "==", email.toLowerCase())
                    .limit(1)
                    .get();

                let targetedUsername = "";

                if (!userSnapshot.empty) {
                    // Profile exists -> Log the user in
                    userSnapshot.forEach(doc => {
                        targetedUsername = doc.id;
                    });
                } else {
                    // Sign-up process for new emails -> Auto-generate user profiles
                    const generatedHandle = generateUniqueUsername(email);
                    const selectedHouse = sortRandomHouse();
                    const cleanName = email.split('@')[0]; // Extract display name from email prefix

                    const baseWizardData = {
                        name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
                        email: email.toLowerCase(),
                        coins: 0,
                        streak: 0,
                        questionsSolved: 0,
                        questionsAttempted: 0,
                        studyMinutes: 0,
                        house: selectedHouse,
                        questProgress: 0,
                        questTotal: 20
                    };

                    await db.collection("users").doc(generatedHandle).set(baseWizardData);
                    targetedUsername = generatedHandle;
                }

                // Cache active workspace identity details locally before redirecting
                localStorage.setItem("hogwarts_user", targetedUsername);
                window.location.href = "hogwarts.html";

            } catch (error) {
                console.error("Authentication exception:", error);
                alert("An error occurred during verification: " + error.message);
                submitBtn.innerText = "LOG IN";
                submitBtn.disabled = false;
            }
        });
    }
});
// --- 4. GOOGLE AUTHENTICATION EXTENSION ---
// Create the Google Provider instance
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Explicitly attach the function to the global window scope so the HTML can see it
window.loginWithGoogle = async function() {
    const googleBtn = document.getElementById("google-login-btn");
    const originalText = googleBtn.innerHTML;
    
    googleBtn.innerHTML = `Summoning Google... <i class="fa-solid fa-spinner fa-spin"></i>`;
    googleBtn.disabled = true;

    try {
        // Trigger the Firebase Pop-up auth flow
        const result = await firebase.auth().signInWithPopup(googleProvider);
        const user = result.user;
        
        if (!user.email) {
            throw new Error("Could not retrieve email from Google Account.");
        }

        // Check if this Google user already has a wizard profile document
        // We use their email as a unique identifier link
        const userSnapshot = await db.collection("users")
            .where("email", "==", user.email.toLowerCase())
            .limit(1)
            .get();

        let targetedUsername = "";

        if (!userSnapshot.empty) {
            // User exists -> Log them in directly
            userSnapshot.forEach(doc => {
                targetedUsername = doc.id;
            });
        } else {
            // New User -> Auto-generate a unique Discord-style tag and pick a random House
            const prefix = user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
            const discriminator = Math.floor(1000 + Math.random() * 9000);
            const generatedHandle = `${prefix}#${discriminator}`;
            
            const houses = ["Gryffindor", "Ravenclaw", "Hufflepuff", "Slytherin"];
            const selectedHouse = houses[Math.floor(Math.random() * houses.length)];

            const baseWizardData = {
                name: user.displayName || user.email.split('@')[0],
                email: user.email.toLowerCase(),
                coins: 0,
                streak: 0,
                questionsSolved: 0,
                questionsAttempted: 0,
                studyMinutes: 0,
                house: selectedHouse,
                questProgress: 0,
                questTotal: 20
            };

            await db.collection("users").doc(generatedHandle).set(baseWizardData);
            targetedUsername = generatedHandle;
        }

        // Save layout token identity details and route back home
        localStorage.setItem("hogwarts_user", targetedUsername);
        window.location.href = "hogwarts.html";

    } catch (error) {
        console.error("Google Authentication Exception:", error);
        alert("Google Login failed: " + error.message);
        
        // Reset button state on failure
        googleBtn.innerHTML = originalText;
        googleBtn.disabled = false;
    }
};