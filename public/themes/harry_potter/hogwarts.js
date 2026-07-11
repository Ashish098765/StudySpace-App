// --- 1. FIREBASE CONFIGURATION & INITIALIZATION ---
const firebaseConfig = {
    apiKey: "AIzaSyB57PcjYtWktsOGKFLQmWX-Nc6HtYeZxp8",
    authDomain: "studyspace-f6e22.firebaseapp.com",
    projectId: "studyspace-f6e22",
    storageBucket: "studyspace-f6e22.firebasestorage.app",
    messagingSenderId: "498741408880",
    appId: "1:498741408880:web:bd5fdea00d10e9329130b5",
    measurementId: "G-J1X8Y7KDQV"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

document.addEventListener("DOMContentLoaded", () => {
    // --- 2. CURRENT USER STATE (Initialized to 0 for Guests) ---
    let currentUser = localStorage.getItem("hogwarts_user") || "guest";
    let userData = {
        coins: 0,
        streak: 0,
        questionsSolved: 0,
        questionsAttempted: 0, 
        studyMinutes: 0, 
        house: "Ravenclaw",
        questProgress: 0,
        questTotal: 20
    };

    // --- 3. DOM ELEMENT SELECTORS ---
    const coinCountEl = document.getElementById("coin-count");
    const streakEl = document.querySelector(".stat-card:nth-child(1) .stat-value");
    const solvedEl = document.querySelector(".stat-card:nth-child(2) .stat-value");
    const studyTimeEl = document.querySelector(".stat-card:nth-child(3) .stat-value");
    const accuracyEl = document.querySelector(".stat-card:nth-child(4) .stat-value");
    const questProgressFill = document.querySelector(".progress-fill");
    const questProgressText = document.querySelector(".progress-text");
    const startStudyBtn = document.getElementById("start-study-btn");
    const houseListEl = document.querySelector(".house-list");
    const loginBtn = document.querySelector(".btn-login-toggle");

    let studyTimer = null;
    let isStudying = false;

    // --- 4. FIREBASE SYNCHRONIZATION ---

    async function initializeUserDashboard() {
        // Dynamic UI adjustment if user is a guest vs authenticated
        if (loginBtn) {
            if (currentUser === "guest") {
                loginBtn.innerHTML = `<i class="fa-solid fa-arrow-right-to-bracket"></i> Log In`;
            } else {
                loginBtn.innerHTML = `<i class="fa-solid fa-arrow-right-from-bracket"></i> ${currentUser}`;
            }
        }
        
        await loadUserData();
        await loadHouseScores();
    }

    // Fetch user profile from Firestore (Only syncs/saves if logged in, stays local if guest)
    async function loadUserData() {
        if (currentUser === "guest") {
            renderDashboard();
            return;
        }

        try {
            const userRef = db.collection("users").doc(currentUser);
            const doc = await userRef.get();

            if (doc.exists) {
                userData = doc.data();
            } else {
                // If logged-in user doesn't have a record yet, create one with base stats
                await userRef.set(userData);
            }
            renderDashboard();
        } catch (error) {
            console.error("Error connecting to Firestore: ", error);
            renderDashboard(); // Fallback to current rendering if network fails
        }
    }

    // Push modifications to Firestore (Only if user is authenticated)
    async function syncDataToFirebase() {
        if (currentUser === "guest") return;
        try {
            await db.collection("users").doc(currentUser).set(userData, { merge: true });
        } catch (error) {
            console.error("Failed to sync profile metrics: ", error);
        }
    }

    // Hourly global house score calculations aggregator
    async function loadHouseScores() {
        const lastCheck = localStorage.getItem("house_scores_timestamp");
        const cachedScores = localStorage.getItem("house_scores_data");
        const oneHour = 60 * 60 * 1000;

        if (lastCheck && cachedScores && (Date.now() - lastCheck < oneHour)) {
            renderHouseCup(JSON.parse(cachedScores));
            return;
        }

        try {
            const snapshot = await db.collection("users").get();
            const aggregates = { Ravenclaw: 0, Gryffindor: 0, Hufflepuff: 0, Slytherin: 0 };

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.house && aggregates[data.house] !== undefined) {
                    aggregates[data.house] += (data.coins || 0); 
                }
            });

            localStorage.setItem("house_scores_data", JSON.stringify(aggregates));
            localStorage.setItem("house_scores_timestamp", Date.now());
            
            renderHouseCup(aggregates);
        } catch (error) {
            console.error("Error generating aggregate house details: ", error);
            // Dynamic fallback if firebase has no documents yet
            renderHouseCup({ Ravenclaw: 0, Gryffindor: 0, Hufflepuff: 0, Slytherin: 0 });
        }
    }

    // --- 5. RENDER LOGIC ---
    function renderDashboard() {
        if (coinCountEl) coinCountEl.innerText = userData.coins;
        if (streakEl) streakEl.innerHTML = `<i class="fa-solid fa-fire-flame-curved"></i> ${userData.streak}`;
        if (solvedEl) solvedEl.innerHTML = `<i class="fa-regular fa-compass"></i> ${userData.questionsSolved}`;
        
        // Exact mathematical calculation for accuracy rates
        const accuracyRate = userData.questionsAttempted > 0 
            ? Math.round((userData.questionsSolved / userData.questionsAttempted) * 100) 
            : 0;
        if (accuracyEl) accuracyEl.innerHTML = `<i class="fa-regular fa-circle-check"></i> ${accuracyRate}%`;

        // Hours & Minutes formatting
        const hrs = Math.floor(userData.studyMinutes / 60);
        const mins = userData.studyMinutes % 60;
        if (studyTimeEl) studyTimeEl.innerHTML = `<i class="fa-solid fa-stopwatch"></i> ${hrs}h ${mins}m`;

        // Daily Quest UI mapping
        const progressPercent = (userData.questProgress / userData.questTotal) * 100;
        if (questProgressFill) questProgressFill.style.width = `${Math.min(progressPercent, 100)}%`;
        if (questProgressText) questProgressText.innerText = `${userData.questProgress}/${userData.questTotal}`;
    }

    function renderHouseCup(scores) {
        if (!houseListEl) return;

        // Sort dynamically based on top performers
        const sortedHouses = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        houseListEl.innerHTML = "";

        sortedHouses.forEach(([houseName, score], index) => {
            const li = document.createElement("li");
            li.innerHTML = `
                <div class="house-info">
                    <span class="house-rank">${index + 1}</span>
                    <img src="https://res.cloudinary.com/dyxyzz9r9/image/upload/v1783761433/${houseName.toLowerCase()}.png" alt="${houseName}">
                    <span>${houseName}</span>
                </div>
                <span>${score}</span>
            `;
            houseListEl.appendChild(li);
        });
    }

    // --- 6. ACTION EVENT HANDLERS ---

    // Focus Study Counter Simulation
    if (startStudyBtn) {
        startStudyBtn.addEventListener("click", () => {
            if (!isStudying) {
                isStudying = true;
                startStudyBtn.innerHTML = `Focusing... <i class="fa-solid fa-wand-magic-sparkles fa-spin"></i>`;
                startStudyBtn.style.background = "var(--text-muted)";
                
                studyTimer = setInterval(() => {
                    userData.studyMinutes += 1;
                    userData.coins += 1; 
                    renderDashboard();
                }, 5000);
            } else {
                clearInterval(studyTimer);
                isStudying = false;
                startStudyBtn.innerHTML = `Start Studying <i class="fa-solid fa-wand-magic-sparkles"></i>`;
                startStudyBtn.style.background = "var(--dark-blue)";
                
                // Save locally and upload to database if logged in
                syncDataToFirebase();
            }
        });
    }

    // Handle Log In / Log Out layout click states cleanly
    if (loginBtn) {
        loginBtn.addEventListener("click", (e) => {
            if (currentUser !== "guest") {
                e.preventDefault();
                if(confirm("Do you want to log out of this wizard account?")) {
                    localStorage.removeItem("hogwarts_user");
                    location.reload();
                }
            }
            // If it is a guest, clicking it automatically triggers your HTML's href='hp_login.html' redirection smoothly
        });
    }

    // Run setup on launch
    initializeUserDashboard();
});