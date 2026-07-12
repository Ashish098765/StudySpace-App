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

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

document.addEventListener("DOMContentLoaded", () => {
    let currentUser = localStorage.getItem("hogwarts_user") || "guest";
    let userData = {
        name: "Mischief Managed!",
        coins: 0,
        streak: 0,
        lastActiveDate: null,
        questionsSolved: 0,
        questionsAttempted: 0, 
        studyMinutes: 0, 
        house: "Ravenclaw",
        questProgress: 0,
        questTotal: 20,
        // Add this array to store tasks
        tasks: [
            { id: 1, name: "Physics PYQs", subject: "Physics", targetType: "questions", targetValue: 30, done: true },
            { id: 2, name: "Chemistry PYQs", subject: "Chemistry", targetType: "questions", targetValue: 25, done: true },
            { id: 3, name: "Maths PYQs", subject: "Mathematics", targetType: "questions", targetValue: 30, done: false },
            { id: 4, name: "Revision", subject: "Mathematics", targetType: "time", targetValue: 120, done: false }
        ]
    };
    
    // Add this global tracker right below your selectors
    window.selectedTaskId = null;

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
    
    const userNameEl = document.getElementById("user-display-name");
    const houseNameEl = document.getElementById("user-house-name");
    const houseCrestEl = document.getElementById("user-house-crest");

    let studyTimer = null;
    let isStudying = false;

    // --- 2. CORE LOGIC FUNCTIONS ---

    function calculateDailyStreak() {
        let changed = false;
        // Get today's date in YYYY-MM-DD format based on local time
        const today = new Date().toLocaleDateString('en-CA'); 
        
        if (userData.lastActiveDate !== today) {
            if (userData.lastActiveDate) {
                const lastDate = new Date(userData.lastActiveDate);
                const currDate = new Date(today);
                // Calculate difference in days
                const diffTime = Math.abs(currDate - lastDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

                if (diffDays === 1) {
                    userData.streak += 1; // Logged in exactly the next day
                } else if (diffDays > 1) {
                    userData.streak = 1; // Streak broken, reset to 1
                }
            } else {
                userData.streak = 1; // First time logging in
            }
            userData.lastActiveDate = today;
            changed = true;
        }
        return changed;
    }

    function syncCrossPageData() {
        let changed = false;
        
        // Retrieve pending metrics submitted by practice.html or room.html
        const pendingCorrect = parseInt(localStorage.getItem("hp_pending_correct") || 0);
        const pendingIncorrect = parseInt(localStorage.getItem("hp_pending_incorrect") || 0);
        const pendingMins = parseInt(localStorage.getItem("hp_pending_minutes") || 0);

        if (pendingCorrect > 0 || pendingIncorrect > 0 || pendingMins > 0) {
            // Apply Accuracy Logic
            userData.questionsSolved += pendingCorrect;
            userData.questionsAttempted += (pendingCorrect + pendingIncorrect);
            
            // Apply Coin Logic: (+8 for correct, -2 for incorrect, cap at 0 minimum)
            const earnedCoins = (pendingCorrect * 8) - (pendingIncorrect * 2);
            userData.coins = Math.max(0, userData.coins + earnedCoins);
            
            // Apply Study Time Logic
            userData.studyMinutes += pendingMins;

            // Clear the local cache so we don't double-count
            localStorage.removeItem("hp_pending_correct");
            localStorage.removeItem("hp_pending_incorrect");
            localStorage.removeItem("hp_pending_minutes");
            
            changed = true;
        }
        return changed;
    }

    // --- 3. DATABASE SYNC & INITIALIZATION ---

    async function initializeUserDashboard() {
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
                await userRef.set(userData);
            }

            // Check for cross-page updates and daily streak progression
            const streakUpdated = calculateDailyStreak();
            const externalDataUpdated = syncCrossPageData();

            if (streakUpdated || externalDataUpdated) {
                await syncDataToFirebase();
            }

            renderDashboard();
        } catch (error) {
            console.error("Error connecting to Firestore: ", error);
            renderDashboard();
        }
    }

    async function syncDataToFirebase() {
        if (currentUser === "guest") return;
        try {
            await db.collection("users").doc(currentUser).set(userData, { merge: true });
        } catch (error) {
            console.error("Failed to sync profile metrics: ", error);
        }
    }

    async function loadHouseScores() {
        const lastCheck = localStorage.getItem("house_scores_timestamp");
        const cachedScores = localStorage.getItem("house_scores_data");
        const oneHour = 60 * 60 * 1000;

        // Uses a 1-hour cache buffer to reduce server load as requested
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
                    // This dynamically captures the +/- coin changes from all users
                    aggregates[data.house] += (data.coins || 0); 
                }
            });

            localStorage.setItem("house_scores_data", JSON.stringify(aggregates));
            localStorage.setItem("house_scores_timestamp", Date.now());
            renderHouseCup(aggregates);
        } catch (error) {
            console.error("Error generating house details: ", error);
            renderHouseCup({ Ravenclaw: 0, Gryffindor: 0, Hufflepuff: 0, Slytherin: 0 });
        }
    }

    // --- 4. RENDER UI ---

    function renderDashboard() {
        if (coinCountEl) coinCountEl.innerText = userData.coins;
        if (streakEl) streakEl.innerHTML = `<i class="fa-solid fa-fire-flame-curved"></i> ${userData.streak}`;
        if (solvedEl) solvedEl.innerHTML = `<i class="fa-regular fa-compass"></i> ${userData.questionsSolved}`;
        
        if (userNameEl) userNameEl.innerText = userData.name || "Wizard";
        if (houseNameEl) houseNameEl.innerText = userData.house || "Ravenclaw";
        if (houseCrestEl && userData.house) {
            houseCrestEl.src = `https://res.cloudinary.com/dyxyzz9r9/image/upload/v1783761433/${userData.house.toLowerCase()}.png`;
            houseCrestEl.alt = `${userData.house} Crest`;
        }

        // Accuracy Equation: (Correct / Attempted) * 100
        const accuracyRate = userData.questionsAttempted > 0 
            ? Math.round((userData.questionsSolved / userData.questionsAttempted) * 100) 
            : 0;
        if (accuracyEl) accuracyEl.innerHTML = `<i class="fa-regular fa-circle-check"></i> ${accuracyRate}%`;

        const hrs = Math.floor(userData.studyMinutes / 60);
        const mins = userData.studyMinutes % 60;
        if (studyTimeEl) studyTimeEl.innerHTML = `<i class="fa-solid fa-stopwatch"></i> ${hrs}h ${mins}m`;

        const progressPercent = (userData.questProgress / userData.questTotal) * 100;
        if (questProgressFill) questProgressFill.style.width = `${Math.min(progressPercent, 100)}%`;
        if (questProgressText) questProgressText.innerText = `${userData.questProgress}/${userData.questTotal}`;
    }

    function renderHouseCup(scores) {
        if (!houseListEl) return;
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

    // --- 5. EVENT LISTENERS ---

    if (startStudyBtn) {
        startStudyBtn.addEventListener("click", () => {
            // REDIRECT LOGIC
            if (window.selectedTaskId) {
                const selectedTask = userData.tasks.find(t => t.id === window.selectedTaskId);
                if (selectedTask) {
                    if (selectedTask.targetType === "questions") {
                        // Pass the subject to the practice page
                        window.location.href = `../../practice.html?subject=${encodeURIComponent(selectedTask.subject)}`;
                    } else {
                        // Pass the subject to the study rooms
                        window.location.href = `../../room.html?subject=${encodeURIComponent(selectedTask.subject)}`;
                    }
                    return; // Stop execution so the local timer doesn't trigger
                }
            }

            // FALLBACK: LOCAL TIMER LOGIC (If no task is selected)
            if (!isStudying) {
                isStudying = true;
                startStudyBtn.innerHTML = `Focusing... <i class="fa-solid fa-wand-magic-sparkles fa-spin"></i>`;
                startStudyBtn.style.background = "var(--text-muted)";
                
                studyTimer = setInterval(() => {
                    userData.studyMinutes += 1;
                    userData.coins += 1; 
                    renderDashboard();
                }, 60000); 
            } else {
                clearInterval(studyTimer);
                isStudying = false;
                startStudyBtn.innerHTML = `Start Studying <i class="fa-solid fa-wand-magic-sparkles"></i>`;
                startStudyBtn.style.background = "var(--dark-blue)";
                syncDataToFirebase();
            }
        });
    }

    if (loginBtn) {
        loginBtn.addEventListener("click", (e) => {
            if (currentUser !== "guest") {
                e.preventDefault();
                if(confirm("Do you want to log out of this wizard account?")) {
                    localStorage.removeItem("hogwarts_user");
                    location.reload();
                }
            }
        });
    }

    initializeUserDashboard();
});
// --- DAILY PLANNER LOGIC ---
    window.openTaskModal = () => document.getElementById("task-modal").style.display = "flex";
    window.closeTaskModal = () => document.getElementById("task-modal").style.display = "none";
    
    window.toggleTaskInput = () => {
        const type = document.getElementById("modal-task-type").value;
        const label = document.getElementById("target-value-label");
        const input = document.getElementById("modal-task-value");
        if (type === "questions") {
            label.innerText = "Number of Questions";
            input.placeholder = "e.g., 30";
        } else {
            label.innerText = "Study Duration (in minutes)";
            input.placeholder = "e.g., 120";
        }
    };

    window.saveNewTask = () => {
        const name = document.getElementById("modal-task-name").value.trim();
        const subject = document.getElementById("modal-task-subject").value;
        const type = document.getElementById("modal-task-type").value;
        const value = parseInt(document.getElementById("modal-task-value").value);

        if (!name || isNaN(value) || value <= 0) return alert("Please provide a valid task name and target number.");

        const newTask = {
            id: Date.now(),
            name: name,
            subject: subject,
            targetType: type,
            targetValue: value,
            done: false
        };

        userData.tasks.push(newTask);
        syncDataToFirebase();
        renderDashboard();
        closeTaskModal();
        
        // Reset modal inputs
        document.getElementById("modal-task-name").value = "";
        document.getElementById("modal-task-value").value = "";
    };

    window.selectTask = (taskId) => {
        // Toggle selection
        window.selectedTaskId = window.selectedTaskId === taskId ? null : taskId;
        renderDashboard();
    };