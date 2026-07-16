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
        xp: 0,
        level: 1,
        exam: null,
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
    // --- LEVEL UP LOGIC & TITLES ---
    function getWizardTitle(level) {
        if (level >= 100) return "Merlin's Legacy";
        if (level >= 75) return "Master Wizard";
        if (level >= 50) return "Auror Candidate";
        if (level >= 35) return "Head Student";
        if (level >= 20) return "Prefect";
        if (level >= 10) return "Skilled Wizard";
        if (level >= 5) return "Apprentice";
        return "First Year";
    }

    function calculateLevelProgress(xp) {
        let currentLvl = 1;
        // Formula: XP Required = 100 * Level^1.5
        while (xp >= Math.floor(100 * Math.pow(currentLvl, 1.5))) {
            currentLvl++;
        }
        
        const currentLvlXp = currentLvl === 1 ? 0 : Math.floor(100 * Math.pow(currentLvl - 1, 1.5));
        const nextLvlXp = Math.floor(100 * Math.pow(currentLvl, 1.5));
        const xpIntoLevel = xp - currentLvlXp;
        const xpRequired = nextLvlXp - currentLvlXp;
        
        return { 
            level: currentLvl, 
            progressPercent: (xpIntoLevel / xpRequired) * 100, 
            nextLvlXp: nextLvlXp 
        };
    }

    // --- 2. CORE LOGIC FUNCTIONS ---

    function calculateDailyStreak() {
        let changed = false;
        // Get today's date in YYYY-MM-DD format based on local time
        const today = new Date().toLocaleDateString('en-CA'); 
        
        if (userData.lastActiveDate !== today) {
            userData.tasks = [];
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

        const activeTaskId = parseInt(localStorage.getItem("active_task_id"));
        if (activeTaskId) {
            const task = userData.tasks.find(t => t.id === activeTaskId);
            if (task && !task.done) {
                if (task.targetType === "questions") {
                    task.currentProgress = (task.currentProgress || 0) + (pendingCorrect + pendingIncorrect);
                } else if (task.targetType === "time") {
                    task.currentProgress = (task.currentProgress || 0) + pendingMins;
                }
                
                if (task.currentProgress >= task.targetValue) {
                    task.done = true;
                    userData.xp = (userData.xp || 0) + 100; // 100 XP for task completion
                    setTimeout(() => alert(`Magical! You completed your daily task: ${task.name}! (+100 XP)`), 500);
                }
            }
            localStorage.removeItem("active_task_id");
            changed = true;
        }

        if (pendingCorrect > 0 || pendingIncorrect > 0 || pendingMins > 0) {
            // Apply XP Logic: 2 XP per question attempt, +3 XP bonus for correct (Total 5)
            let earnedXP = (pendingCorrect * 5) + (pendingIncorrect * 2);
            earnedXP += Math.floor(pendingMins / 30) * 20; // 20 XP per 30 mins active
            userData.xp = (userData.xp || 0) + earnedXP;

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
                if (!userData.tasks) {
                    userData.tasks = []; 
                }
            } else {
                await userRef.set(userData);
            }
            if (!userData.exam && currentUser !== "guest") {
                document.getElementById("exam-modal").style.display = "flex";
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
        
        // Calculate dynamic level info
        const levelStats = calculateLevelProgress(userData.xp || 0);
        userData.level = levelStats.level;
        
        const levelDisplay = document.getElementById("user-level-display");
        const wizardTitle = document.getElementById("user-wizard-title");
        const xpFill = document.getElementById("user-xp-fill");
        
        if (levelDisplay) levelDisplay.innerText = `Level ${userData.level}`;
        if (wizardTitle) wizardTitle.innerHTML = `<i class="fa-solid fa-hat-wizard"></i> ${getWizardTitle(userData.level)}`;
        if (xpFill) {
            xpFill.style.width = `${Math.min(levelStats.progressPercent, 100)}%`;
            xpFill.title = `${userData.xp} / ${levelStats.nextLvlXp} XP`;
        }

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

        // --- ADD THIS MISSING BLOCK TO RENDER THE TASKS ---
        const taskListEl = document.getElementById("dynamic-task-list");
        if (taskListEl && userData.tasks) {
            taskListEl.innerHTML = "";
            userData.tasks.forEach(task => {
                const isQuestions = task.targetType === "questions";
                
                // Format display text (Questions vs Hours/Mins)
                const currentProg = task.currentProgress || 0;
                // Format display text as completed/total format
                const subText = isQuestions 
                    ? `${currentProg}/${task.targetValue} Questions` 
                    : `${currentProg}/${task.targetValue} mins`;
                
                // Format Icons based on completion and type
                const iconHtml = task.done 
                    ? `<div class="task-icon"><i class="fa-solid fa-check"></i></div>` 
                    : `<div class="task-icon" style="background: transparent; border: 1px solid var(--text-muted);"><i class="fa-solid ${isQuestions ? 'fa-pencil' : 'fa-book-open'}" style="color:var(--text-muted); opacity: 0.5;"></i></div>`;
                
                const statusHtml = task.done
                    ? `<div class="task-status done"><i class="fa-solid fa-check"></i></div>`
                    : `<div class="task-status pending"></div>`;

                const li = document.createElement("li");
                if (window.selectedTaskId === task.id) li.classList.add("selected");
                
                li.onclick = () => window.selectTask(task.id);
                
                li.innerHTML = `
                    <div class="task-info">
                        ${iconHtml}
                        <div class="task-text">
                            <h4 style="${task.done ? 'opacity:0.7; text-decoration:line-through;' : ''}">
                                ${task.name} 
                                <i class="fa-solid fa-pen task-edit-icon" onclick="event.stopPropagation(); editTask(${task.id})" title="Modify Task"></i>
                            </h4>
                            <p>${subText}</p>
                        </div>
                    </div>
                    ${statusHtml}
                `;
                taskListEl.appendChild(li);
            });
        }
        // ---------------------------------------------------
    }

    function renderHouseCup(scores) {
        if (!houseListEl) return;
        const sortedHouses = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        houseListEl.innerHTML = "";

        sortedHouses.forEach(([houseName, score], index) => {
            const li = document.createElement("li");
            li.classList.add("house-item");

            // Build the custom HTML tooltip
            let personalContributionHtml = '';
            if (userData.house === houseName) {
                personalContributionHtml = `
                    <div class="tooltip-row highlight">
                        <span>Your Contribution:</span> 
                        <span>${userData.coins} <i class="fa-solid fa-gem" style="font-size:10px; margin-left:3px;"></i></span>
                    </div>`;
            }

            const tooltipHtml = `
                <div class="house-tooltip">
                    <h4>${houseName} Stats</h4>
                    <div class="tooltip-row">
                        <span>Top Contributor:</span> 
                        <span>Coming Soon!</span>
                    </div>
                    ${personalContributionHtml}
                </div>
            `;

            li.innerHTML = `
                <div class="house-info">
                    <span class="house-rank">${index + 1}</span>
                    <img src="https://res.cloudinary.com/dyxyzz9r9/image/upload/v1783761433/${houseName.toLowerCase()}.png" alt="${houseName}">
                    <span>${houseName}</span>
                </div>
                <span>${score}</span>
                ${tooltipHtml}
            `;
            houseListEl.appendChild(li);
        });
    }

    // --- 5. EVENT LISTENERS ---

    if (startStudyBtn) {
        startStudyBtn.addEventListener("click", () => {
            // REDIRECT LOGIC
            // REDIRECT LOGIC
            if (window.selectedTaskId) {
                const selectedTask = userData.tasks.find(t => t.id === window.selectedTaskId);
                if (selectedTask) {
                    localStorage.setItem("active_task_id", selectedTask.id);
                    if (selectedTask.targetType === "questions") {
                        // Pass both the Exam and the Subject to practice.html
                        const safeExam = userData.exam || "JEE Mains"; 
                        window.location.href = `../../practice.html?exam=${encodeURIComponent(safeExam)}&subject=${encodeURIComponent(selectedTask.subject)}`;
                    } else {
                        // Redirect time-based tasks straight into the Pomodoro study room
                        window.location.href = `../../room.html?id=public-pomodoro`;
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
                    
                    // Small XP drip for active local studying (approx. 20 XP every 30 mins)
                    if (userData.studyMinutes % 30 === 0) {
                        userData.xp = (userData.xp || 0) + 20;
                    }

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
    // --- DAILY PLANNER LOGIC ---
    window.openTaskModal = () => {
        // Reset modal to "Add" mode
        document.getElementById("modal-task-name").value = "";
        document.getElementById("modal-task-value").value = "";
        document.getElementById("modal-btn-delete").style.display = "none";
        
        const saveBtn = document.getElementById("modal-btn-save");
        saveBtn.innerText = "Add Task";
        saveBtn.onclick = saveNewTask;
        
        document.getElementById("task-modal").style.display = "flex";
    };

    window.editTask = (taskId) => {
        const task = userData.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // Populate modal with existing data
        document.getElementById("modal-task-name").value = task.name;
        document.getElementById("modal-task-subject").value = task.subject;
        document.getElementById("modal-task-type").value = task.targetType;
        document.getElementById("modal-task-value").value = task.targetValue;
        
        // Show Delete Button and handle deletion
        // Show Delete Button and handle deletion (Prevent deletion if task is done)
        const deleteBtn = document.getElementById("modal-btn-delete");
        if (task.done) {
            deleteBtn.style.display = "none";
        } else {
            deleteBtn.style.display = "inline-block";
            deleteBtn.onclick = () => {
                if(confirm(`Are you sure you want to delete "${task.name}"?`)) {
                    userData.tasks = userData.tasks.filter(t => t.id !== taskId);
                    syncDataToFirebase();
                    renderDashboard();
                    closeTaskModal();
                }
            };
        }
        
        // Change the save button temporarily to handle edits
        const saveBtn = document.getElementById("modal-btn-save");
        saveBtn.innerText = "Update Task";
        saveBtn.onclick = () => {
            task.name = document.getElementById("modal-task-name").value.trim();
            task.subject = document.getElementById("modal-task-subject").value;
            task.targetType = document.getElementById("modal-task-type").value;
            task.targetValue = parseInt(document.getElementById("modal-task-value").value);
            
            syncDataToFirebase();
            renderDashboard();
            closeTaskModal();
        };
        
        document.getElementById("task-modal").style.display = "flex";
    };
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
            currentProgress: 0,
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
        
        // Reset Start Studying button if currently running
        if (isStudying && window.selectedTaskId) {
            clearInterval(studyTimer);
            isStudying = false;
            const startStudyBtn = document.getElementById("start-study-btn");
            if (startStudyBtn) {
                startStudyBtn.innerHTML = `Start Studying <i class="fa-solid fa-wand-magic-sparkles"></i>`;
                startStudyBtn.style.background = "var(--dark-blue)";
            }
        }
        
        renderDashboard();
    };

    // --- EXAM SELECTION LOGIC ---
    window.saveExamSelection = () => {
        const selectedExam = document.getElementById("modal-exam-select").value;
        userData.exam = selectedExam;
        document.getElementById("exam-modal").style.display = "none";
        
        // Save to Firebase immediately
        syncDataToFirebase();
        renderDashboard();
    };

    const dailyQuestCard = document.querySelector(".daily-quest");
    if (dailyQuestCard) {
        dailyQuestCard.style.cursor = "pointer";
        dailyQuestCard.addEventListener("click", () => {
            document.getElementById("daily-quest-modal").style.display = "flex";
            const progressPercent = (userData.questProgress / userData.questTotal) * 100;
            document.getElementById("modal-quest-progress-fill").style.width = `${Math.min(progressPercent, 100)}%`;
            document.getElementById("modal-quest-progress-text").innerText = `${userData.questProgress}/${userData.questTotal}`;
        });
    }

    window.closeDailyQuestModal = () => {
        document.getElementById("daily-quest-modal").style.display = "none";
    };

    // =========================================================================
    // --- ADVANCED AGORA VIDEO & FIRESTORE REAL-TIME CHAT INTEGRATION ---
    // =========================================================================
    const APP_ID = "8a735e3d22a7475babf205eab01d8859"; // Agora App ID
    let currentRoomId = "public-general";
    let agoraClient = null;
    let localTracks = { audioTrack: null, videoTrack: null };
    let mediaStates = { mic: false, cam: false, joined: false };
    let remoteUsersMap = {};

    const roomTypePopup = document.getElementById("room-type-popup");
    const viewSections = document.querySelectorAll(".view-section");
    const chatContainer = document.querySelector(".chat-container");
    const chatInput = document.querySelector(".chat-input-bar input");
    
    // Custom Navigation Hijack for Study Rooms Layout
    document.querySelectorAll(".sidebar nav a").forEach(link => {
        link.addEventListener("click", (e) => {
            const targetId = link.getAttribute("data-target");
            if (!targetId) return;
            
            e.preventDefault();
            
            // Handle Study Rooms Popup
            if (targetId === "study-rooms-view") {
                const linkRect = link.getBoundingClientRect();
                if(roomTypePopup) {
                    roomTypePopup.style.top = `${linkRect.top}px`;
                    roomTypePopup.style.left = `${linkRect.right + 8}px`;
                    roomTypePopup.classList.toggle("show");
                }
                return;
            }
            
            // --- NEW: Handle all other tabs (like Dashboard) ---
            if(roomTypePopup) roomTypePopup.classList.remove("show");
            
            if (viewSections) viewSections.forEach(sec => sec.style.display = "none");
            const targetView = document.getElementById(targetId);
            if (targetView) targetView.style.display = "flex";
            
            document.querySelectorAll(".sidebar nav li").forEach(li => li.classList.remove("active"));
            link.parentElement.classList.add("active");
            // ----------------------------------------------------
        });
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest("nav") && !e.target.closest("#room-type-popup")) {
            if(roomTypePopup) roomTypePopup.classList.remove("show");
        }
    });

    // --- Modal View Management Switches ---
    window.switchRoomTab = (mode) => {
        document.getElementById("create-room-section").style.display = mode === "create" ? "block" : "none";
        document.getElementById("join-room-section").style.display = mode === "join" ? "block" : "none";
        document.getElementById("tab-create-room").classList.toggle("active", mode === "create");
        document.getElementById("tab-join-room").classList.toggle("active", mode === "join");
    };

    window.closePrivateRoomModal = () => {
        document.getElementById("private-room-modal").style.display = "none";
        document.getElementById("create-room-id").value = "";
        document.getElementById("create-room-pwd").value = "";
        document.getElementById("join-room-id").value = "";
        document.getElementById("join-room-pwd").value = "";
    };

    const btnPublic = document.getElementById("btn-public-room");
    if (btnPublic) {
        btnPublic.onclick = () => {
            roomTypePopup.classList.remove("show");
            enterStudyRoom("public-general");
        };
    }

    const btnPrivate = document.getElementById("btn-private-room");
    if (btnPrivate) {
        btnPrivate.onclick = () => {
            roomTypePopup.classList.remove("show");
            document.getElementById("private-room-modal").style.display = "flex";
        };
    }

    // --- STRICT PRIVATE ROOM CREATION LOGIC ---
    window.handleCreatePrivateRoom = async () => {
        const id = document.getElementById("create-room-id").value.trim();
        const pwd = document.getElementById("create-room-pwd").value.trim();
        if(!id || !pwd) return alert("Must configure Room Code and Passphrase seals!");
        
        const roomRef = db.collection("rooms").doc(id);
        const roomDoc = await roomRef.get();

        if (roomDoc.exists) {
            const participants = await roomRef.collection("participants").get();
            if (!participants.empty) {
                return alert("This Room ID is currently active! Please choose a unique ID or join the existing room.");
            } else {
                // Room is abandoned. Completely wipe all ghost data and old chats.
                const oldMsgs = await roomRef.collection("messages").get();
                oldMsgs.forEach(m => m.ref.delete());
                participants.forEach(p => p.ref.delete());
            }
        }
        
        await roomRef.set({ password: pwd, created: Date.now() });
        closePrivateRoomModal();
        enterStudyRoom(id);
    };

    window.handleJoinPrivateRoom = async () => {
        const id = document.getElementById("join-room-id").value.trim();
        const pwd = document.getElementById("join-room-pwd").value.trim();
        if(!id || !pwd) return alert("Credentials mandatory to break counter-hexes!");
        
        const roomDoc = await db.collection("rooms").doc(id).get();
        if(!roomDoc.exists || roomDoc.data().password !== pwd) {
            return alert("Access Denied! The protective spells rejected your passphrase signature.");
        }
        closePrivateRoomModal();
        enterStudyRoom(id);
    };

    // --- Core Media & Signal Engine Operations ---
    let roomStudyTimer = null; 
    let uiTimerInterval = null;
    let roomSeconds = 0;

    // Ghost user cleanup on browser tab close
    window.addEventListener("beforeunload", () => {
        if(mediaStates.joined && currentRoomId && agoraClient) {
            db.collection("rooms").doc(currentRoomId).collection("participants").doc(String(agoraClient.uid)).delete();
        }
    });

    async function enterStudyRoom(roomId) {
        currentRoomId = roomId;
        
        // Transition Dashboard Frames
        if (viewSections) viewSections.forEach(sec => sec.style.display = "none");
        const studyRoomsView = document.getElementById("study-rooms-view");
        if (studyRoomsView) studyRoomsView.style.display = "flex";

        // Highlight Study Rooms in Sidebar
        document.querySelectorAll(".sidebar nav li").forEach(li => li.classList.remove("active"));
        const studyRoomLink = document.querySelector(".sidebar nav a[data-target='study-rooms-view']");
        if (studyRoomLink) studyRoomLink.parentElement.classList.add("active");
        
        // Setup Room UI Headers
        const isPublic = roomId.startsWith("public-");
        const headerTitle = document.querySelector(".grid-header h2");
        if(headerTitle) headerTitle.innerText = isPublic ? `Public Lounge (${roomId})` : `Secret Chamber: ${roomId}`;

        // Reset & Start Live UI Timer
        roomSeconds = 0;
        const timerDisplay = document.getElementById("room-active-timer");
        if(timerDisplay) timerDisplay.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> 00:00:00`;
        
        uiTimerInterval = setInterval(() => {
            roomSeconds++;
            const h = String(Math.floor(roomSeconds / 3600)).padStart(2, '0');
            const m = String(Math.floor((roomSeconds % 3600) / 60)).padStart(2, '0');
            const s = String(roomSeconds % 60).padStart(2, '0');
            if(timerDisplay) timerDisplay.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> ${h}:${m}:${s}`;
        }, 1000);

        if(!agoraClient) {
            agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
            setupAgoraEventListeners();
        }

        try {
            if(agoraClient.connectionState !== "DISCONNECTED") await agoraClient.leave();
            
            const localUid = await agoraClient.join(APP_ID, currentRoomId, null, null);
            mediaStates.joined = true;

            if(!localTracks.audioTrack) localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
            if(!localTracks.videoTrack) localTracks.videoTrack = await AgoraRTC.createCameraVideoTrack();

            await localTracks.audioTrack.setMuted(!mediaStates.mic);
            await localTracks.videoTrack.setMuted(!mediaStates.cam);

            // Force UI Icons to match default off states (Show slashes)
            const camIcon = document.querySelector(".control-dock .dock-btn:nth-child(1) i");
            if(camIcon) camIcon.className = mediaStates.cam ? "fa-solid fa-video" : "fa-solid fa-video-slash";
            
            const micIcon = document.querySelector(".control-dock .dock-btn:nth-child(2) i");
            if(micIcon) micIcon.className = mediaStates.mic ? "fa-solid fa-microphone" : "fa-solid fa-microphone-slash";

            const localBox = document.querySelector(".cam-preview-box");
            if(localBox) {
                let trackDiv = document.getElementById("agora-local-container");
                if(!trackDiv) {
                    trackDiv = document.createElement("div");
                    trackDiv.id = "agora-local-container";
                    trackDiv.className = "agora-local-stream";
                    localBox.appendChild(trackDiv);
                }
                localTracks.videoTrack.play(trackDiv.id);
            }

            await agoraClient.publish(Object.values(localTracks));
            
            await db.collection("rooms").doc(currentRoomId).collection("participants").doc(String(localUid)).set({
                name: userData.name || "Mischief Managed",
                house: userData.house || "Ravenclaw",
                camActive: mediaStates.cam,
                timestamp: Date.now()
            });

            // Start Live Dashboard Study Time Sync
            roomStudyTimer = setInterval(() => {
                userData.studyMinutes += 1;
                userData.coins += 1;
                if (userData.studyMinutes % 30 === 0) userData.xp = (userData.xp || 0) + 20;
                renderDashboard();
                syncDataToFirebase();
            }, 60000);

            initializeLiveChatEngine();
            initializeRemoteParticipantsEngine();

        } catch (err) {
            console.error("Magical Connection Breakdown:", err);
            alert("Video Engine failed to start. Please ensure the Agora script is loaded!");
        }
    }

    // Bind Active Controls Interfaces
    const camBtn = document.querySelector(".control-dock .dock-btn:nth-child(1)");
    if (camBtn) {
        camBtn.onclick = async () => {
            if(!localTracks.videoTrack) return;
            mediaStates.cam = !mediaStates.cam;
            await localTracks.videoTrack.setMuted(!mediaStates.cam);
            
            const previewWrap = document.querySelector(".cam-preview-box");
            if (previewWrap) previewWrap.classList.toggle("cam-active", mediaStates.cam);
            const camIcon = document.querySelector(".control-dock .dock-btn:nth-child(1) i");
            if(camIcon) camIcon.className = mediaStates.cam ? "fa-solid fa-video" : "fa-solid fa-video-slash";
            
            if(mediaStates.joined) {
                db.collection("rooms").doc(currentRoomId).collection("participants").doc(String(agoraClient.uid)).update({ camActive: mediaStates.cam });
            }
        };
    }

    const micBtn = document.querySelector(".control-dock .dock-btn:nth-child(2)");
    if (micBtn) {
        micBtn.onclick = async () => {
            if(!localTracks.audioTrack) return;
            mediaStates.mic = !mediaStates.mic;
            await localTracks.audioTrack.setMuted(!mediaStates.mic);
            const micIcon = document.querySelector(".control-dock .dock-btn:nth-child(2) i");
            if(micIcon) micIcon.className = mediaStates.mic ? "fa-solid fa-microphone" : "fa-solid fa-microphone-slash";
        };
    }

    const screenBtn = document.querySelector(".control-dock .dock-btn:nth-child(3)");
    if (screenBtn) {
        screenBtn.onclick = async () => {
            if (!mediaStates.screen) {
                try {
                    localTracks.screenTrack = await AgoraRTC.createScreenVideoTrack();
                    await agoraClient.unpublish([localTracks.videoTrack]);
                    await agoraClient.publish([localTracks.screenTrack]);
                    mediaStates.screen = true;
                    
                    const screenIcon = document.querySelector(".control-dock .dock-btn:nth-child(3) i");
                    if (screenIcon) screenIcon.style.color = "var(--gold)";

                    localTracks.screenTrack.on("track-ended", async () => {
                        await agoraClient.unpublish([localTracks.screenTrack]);
                        localTracks.screenTrack.close();
                        await agoraClient.publish([localTracks.videoTrack]);
                        mediaStates.screen = false;
                        if (screenIcon) screenIcon.style.color = "";
                    });
                } catch (error) {
                    console.error("Screen sharing failed:", error);
                }
            } else {
                await agoraClient.unpublish([localTracks.screenTrack]);
                localTracks.screenTrack.close();
                await agoraClient.publish([localTracks.videoTrack]);
                mediaStates.screen = false;
                const screenIcon = document.querySelector(".control-dock .dock-btn:nth-child(3) i");
                if (screenIcon) screenIcon.style.color = "";
            }
        };
    }

    const leaveBtn = document.querySelector(".control-dock .leave-btn");
    if (leaveBtn) {
        leaveBtn.onclick = async () => {
            if (roomStudyTimer) clearInterval(roomStudyTimer);
            if (uiTimerInterval) clearInterval(uiTimerInterval);
            
            const timerDisplay = document.getElementById("room-active-timer");
            if(timerDisplay) timerDisplay.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> 00:00:00`;

            if(agoraClient) {
                if(mediaStates.joined) {
                    await db.collection("rooms").doc(currentRoomId).collection("participants").doc(String(agoraClient.uid)).delete();
                }
                await agoraClient.leave();
            }
            mediaStates.joined = false;
            
            if(viewSections) viewSections.forEach(sec => sec.style.display = "none");
            const dashboard = document.getElementById("dashboard-view");
            if(dashboard) dashboard.style.display = "flex";
            
            document.querySelectorAll(".sidebar nav li").forEach(li => li.classList.remove("active"));
            const dashboardLink = document.querySelector(".sidebar nav a[data-target='dashboard-view']");
            if (dashboardLink) dashboardLink.parentElement.classList.add("active");
        };
    }

    // --- Dynamic Remote Stream Handlers ---
    window.setupAgoraEventListeners = function() {
        agoraClient.on("user-published", async (user, mediaType) => {
            await agoraClient.subscribe(user, mediaType);
            
            if(mediaType === "video") {
                remoteUsersMap[user.uid] = user;
                renderGridLayoutCells();
            }
            if(mediaType === "audio") {
                user.audioTrack.play();
            }
        });

        agoraClient.on("user-left", (user) => {
            delete remoteUsersMap[user.uid];
            renderGridLayoutCells();
        });
    };

    function renderGridLayoutCells() {
        const gridLayout = document.getElementById("main-grid-layout");
        if(!gridLayout) return;
        
        gridLayout.innerHTML = ""; 
        
        Object.keys(remoteUsersMap).forEach(uid => {
            const cell = document.createElement("div");
            cell.className = "grid-cell";
            cell.id = `remote-cell-${uid}`;
            cell.innerHTML = `
                <div id="agora-remote-${uid}" class="agora-remote-stream"></div>
                <img src="https://api.dicebear.com/7.x/adventurer/svg?seed=${uid}&backgroundColor=1b263b" alt="Wizard">
                <div class="grid-label" id="label-${uid}">Connecting Mage...</div>
            `;
            gridLayout.appendChild(cell);
            
            setTimeout(() => {
                if(remoteUsersMap[uid] && remoteUsersMap[uid].videoTrack) {
                    remoteUsersMap[uid].videoTrack.play(`agora-remote-${uid}`);
                }
            }, 100);
        });
    }

    function initializeRemoteParticipantsEngine() {
        db.collection("rooms").doc(currentRoomId).collection("participants").onSnapshot(snap => {
            let participantCount = 0;
            snap.forEach(docSnap => {
                participantCount++;
                const uid = docSnap.id;
                
                if(agoraClient && uid === String(agoraClient.uid)) return;
                
                const data = docSnap.data();
                const cell = document.getElementById(`remote-cell-${uid}`);
                const label = document.getElementById(`label-${uid}`);
                
                if(label) label.innerText = `${data.name} (${data.house})`;
                if(cell) cell.classList.toggle("cam-active", data.camActive);
            });
            
            const peopleTab = document.querySelector(".tabs-header .tab:nth-child(2)");
            if (peopleTab) peopleTab.innerText = `People (${participantCount})`;
            
            const gridHeader = document.getElementById("grid-header-title");
            if (gridHeader) gridHeader.innerText = `Room Participants (${participantCount})`;
        });
    }

    // --- Instant Real-Time Chat System Execution Engine ---
    function initializeLiveChatEngine() {
        const chatContainer = document.querySelector(".chat-container");
        if(!chatContainer) return;

        db.collection("rooms").doc(currentRoomId).collection("messages")
          .orderBy("timestamp", "asc")
          .limitToLast(50)
          .onSnapshot(snapshot => {
              chatContainer.innerHTML = "";
              snapshot.forEach(docSnap => {
                  const msg = docSnap.data();
                  const item = document.createElement("div");
                  item.className = "chat-item";
                  item.innerHTML = `
                      <img src="https://api.dicebear.com/7.x/adventurer/svg?seed=${msg.senderName}&backgroundColor=d4ad8c" class="avatar-img" alt="Avatar">
                      <div class="chat-body">
                          <div class="chat-header">
                              <span class="chat-name">${msg.senderName}</span>
                              <span class="chat-time">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                          <div class="chat-text">${msg.text}</div>
                      </div>
                  `;
                  chatContainer.appendChild(item);
              });
              chatContainer.scrollTop = chatContainer.scrollHeight;
          });
    }

    async function submitChatMessage() {
        const chatInput = document.querySelector(".chat-input-bar input");
        if(!chatInput) return;
        
        const text = chatInput.value.trim();
        if(!text) return;
        chatInput.value = "";

        await db.collection("rooms").doc(currentRoomId).collection("messages").add({
            text: text,
            senderName: userData.name || "Wizard Guest",
            timestamp: Date.now()
        });
    }

    const chatSendBtn = document.querySelector(".chat-icons .fa-paper-plane");
    if(chatSendBtn) chatSendBtn.onclick = submitChatMessage;
    
    const chatInputElem = document.querySelector(".chat-input-bar input");
    if(chatInputElem) {
        chatInputElem.onkeypress = (e) => { if(e.key === "Enter") submitChatMessage(); };
    }

    // --- STUDY ROOM VIEW TOGGLE (Grid vs Desk) ---
    window.toggleView = () => {
        const defaultView = document.getElementById('default-view');
        const gridView = document.getElementById('grid-view');

        if (defaultView && gridView) {
            if (defaultView.classList.contains('hidden')) {
                defaultView.classList.remove('hidden');
                gridView.classList.remove('active');
            } else {
                defaultView.classList.add('hidden');
                gridView.classList.add('active');
            }
        }
    };

    // --- RIGHT SIDEBAR TABS (Chat vs People) ---
    const tabChat = document.querySelector(".tabs-header .tab:nth-child(1)");
    const tabPeople = document.querySelector(".tabs-header .tab:nth-child(2)");
    const chatSection = document.getElementById("chat-section-block");
    
    if (tabChat && tabPeople) {
        tabChat.addEventListener("click", () => {
            tabChat.classList.add("active");
            tabPeople.classList.remove("active");
            if (chatSection) chatSection.style.display = "flex";
        });
        
        tabPeople.addEventListener("click", () => {
            tabPeople.classList.add("active");
            tabChat.classList.remove("active");
            if (chatSection) chatSection.style.display = "none";
            // Removed window.toggleView() to fix the unwanted main window switch
        });
    }

    initializeUserDashboard();
});