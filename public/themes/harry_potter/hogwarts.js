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
    let localSessionId = localStorage.getItem("hp_session_id");
    if (!localSessionId) {
        localSessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        localStorage.setItem("hp_session_id", localSessionId);
    }
    
    let currentUser = localStorage.getItem("hogwarts_user") || "guest";
    
    // --- NEW: Safely pull Google Name and Avatar ---
    let storedName = localStorage.getItem("hp_user_name") || "Mischief Managed!";
    let storedAvatar = localStorage.getItem("hp_user_avatar");
    
    // If no Google avatar exists, create a dynamic one based on their name
    if (!storedAvatar || storedAvatar === "undefined" || storedAvatar === "null") {
        storedAvatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(storedName)}&backgroundColor=1b263b`;
    }

    let userData = {
        name: storedName,
        avatar: storedAvatar,
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

    // --- QUEST POOL ---
        const questPool = [
            { id: "q1", title: "The Scholar's Path", desc: "Study for 60 minutes", total: 60, type: "time", reward: 30 },
            { id: "q2", title: "Trial by Fire", desc: "Solve 20 questions correctly", total: 20, type: "solved", reward: 50 },
            { id: "q3", title: "Taskmaster", desc: "Complete 3 planner tasks", total: 3, type: "tasks", reward: 40 },
            { id: "q4", title: "Endurance Test", desc: "Attempt 50 questions", total: 50, type: "attempted", reward: 60 },
            { id: "q5", title: "Deep Work", desc: "Study for 120 minutes", total: 120, type: "time", reward: 100 },
            { id: "q6", title: "Quick Sprints", desc: "Solve 10 questions correctly", total: 10, type: "solved", reward: 20 },
            { id: "q7", title: "Daily Planner", desc: "Complete 1 planner task", total: 1, type: "tasks", reward: 15 }
        ];

        // Function to pick 4 random quests
        function assignDailyQuests() {
            // Shuffle the array and grab the first 4
            const shuffled = questPool.sort(() => 0.5 - Math.random());
            userData.dailyQuests = shuffled.slice(0, 4).map(q => ({
                ...q,
                progress: 0,
                completed: false
            }));
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
        const today = new Date().toLocaleDateString('en-CA'); 
        
        if (userData.lastActiveDate !== today) {
            userData.tasks = []; // Reset daily tasks
            if (userData.lastActiveDate) {
                const lastDate = new Date(userData.lastActiveDate);
                const currDate = new Date(today);
                const diffTime = Math.abs(currDate - lastDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

                if (diffDays === 1) {
                    userData.streak += 1;
                } else if (diffDays > 1) {
                    userData.streak = 1;
                }
            } else {
                userData.streak = 1;
            }
            userData.lastActiveDate = today;
            assignDailyQuests(); // Assign new quests on a new day!
            changed = true;
        }
        
        // Safety check: If for some reason they don't have quests, assign them
        if (!userData.dailyQuests || userData.dailyQuests.length === 0) {
            assignDailyQuests();
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
                const fetchedData = doc.data();
                // Block multi-device login
                if (fetchedData.sessionId && fetchedData.sessionId !== localSessionId) {
                    alert("Your magical signature is active on another device. Logging out to protect your account.");
                    localStorage.removeItem("hogwarts_user");
                    location.reload();
                    return;
                }
                userData = fetchedData;
                userData.sessionId = localSessionId; // Update session
                
                // Force a valid avatar if Firebase has broken data
                if (!userData.avatar || userData.avatar === "undefined" || userData.avatar === "null") {
                    userData.avatar = "https://api.dicebear.com/7.x/adventurer/svg?seed=" + encodeURIComponent(userData.name || "Wizard") + "&backgroundColor=1b263b";
                }
                
                if (!userData.tasks) userData.tasks = []; 
            } else {
                userData.sessionId = localSessionId;
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

        // --- NEW: Render Tasks in Study Room ---
        const roomPlanContainer = document.getElementById("room-todays-plan");
        if (roomPlanContainer) {
            if (!userData.tasks || userData.tasks.length === 0) {
                roomPlanContainer.innerHTML = `<div style="font-size: 13px; color: var(--text-muted); font-style: italic; padding: 10px; text-align: center;">No tasks crafted yet. Focus your mind.</div>`;
            } else {
                roomPlanContainer.innerHTML = userData.tasks.map((task, index) => {
                    const progress = Math.min(((task.currentProgress || 0) / task.targetValue) * 100, 100) || 0;
                    return `
                    <div class="plan-item" style="display:block; margin-bottom: 15px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:15px; font-family:'Nunito',sans-serif;">
                            <strong style="color:var(--navy-dark);">${index + 1}. ${task.name}</strong>
                            <small style="color:var(--text-muted); font-weight:bold;">${task.currentProgress || 0}/${task.targetValue}</small>
                        </div>
                        <div class="progress-bar" style="width: 100%; height: 6px; background: rgba(197, 160, 89, 0.2); border-radius: 3px;">
                            <div class="progress-fill" style="height: 100%; width: ${progress}%; background: ${task.done ? '#1f5c33' : '#b58d3c'}; border-radius: 3px;"></div>
                        </div>
                    </div>`;
                }).join('');
            }
        }
        // ---------------------------------------------------
    }
    function renderDailyQuests() {
        const container = document.getElementById("daily-quests-container");
        if (!container || !userData.dailyQuests) return;

        container.innerHTML = ""; // Clear existing

        userData.dailyQuests.forEach(quest => {
            const progressPercent = Math.min((quest.progress / quest.total) * 100, 100);
            const isDone = quest.completed;
            
            // Change colors if completed
            const barColor = isDone ? "#1f5c33" : "#b58d3c";
            const titleStyle = isDone ? "text-decoration: line-through; opacity: 0.7;" : "";

            container.innerHTML += `
                <div class="card daily-quest" style="padding: 15px 20px; flex-direction: row; align-items: center; justify-content: space-between; display: flex;">
                    <span class="card-corner corner-tl"></span><span class="card-corner corner-tr"></span>
                    <span class="card-corner corner-bl"></span><span class="card-corner corner-br"></span>
                    
                    <div class="quest-left" style="display: flex; align-items: center; gap: 15px; flex-grow: 1;">
                        <div style="width: 40px; height: 40px; background: var(--dark-blue); color: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px;">
                            <i class="fa-solid ${isDone ? 'fa-check' : 'fa-star'}"></i>
                        </div>
                        <div class="quest-details" style="flex-grow: 1;">
                            <h4 style="font-size: 16px; font-weight: 600; margin-bottom: 2px; color: var(--text-dark); ${titleStyle}">${quest.title}</h4>
                            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">${quest.desc}</p>
                            <div class="progress-bar" style="width: 100%; height: 5px; background: rgba(197, 160, 89, 0.2); border-radius: 3px; position: relative;">
                                <div class="progress-fill" style="height: 100%; width: ${progressPercent}%; background: ${barColor}; border-radius: 3px; transition: width 0.3s ease;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="quest-reward" style="text-align: right; padding-left: 20px; border-left: 1px solid rgba(197, 160, 89, 0.3);">
                        <div class="reward-amount" style="font-size: 18px; font-weight: bold; color: var(--text-dark); display: flex; align-items: center; gap: 6px;">
                            <img src="https://res.cloudinary.com/dyxyzz9r9/image/upload/v1783761433/coin.png" style="width: 20px; mix-blend-mode: multiply;" alt="Coins"> ${quest.reward}
                        </div>
                        <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${quest.progress}/${quest.total}</p>
                    </div>
                </div>
            `;
        });
    }
    window.updateQuestProgress = function(type, amount) {
        if (!userData.dailyQuests) return;
        let updated = false;

        userData.dailyQuests.forEach(q => {
            if (!q.completed && q.type === type) {
                q.progress += amount;
                if (q.progress >= q.total) {
                    q.progress = q.total;
                    q.completed = true;
                    userData.coins += q.reward; // Give them the coins!
                    userData.xp = (userData.xp || 0) + (q.reward * 2); 
                    alert(`Quest Completed: ${q.title}! (+${q.reward} Coins)`);
                }
                updated = true;
            }
        });

        if (updated) {
            renderDailyQuests();
            syncDataToFirebase();
        }
    };
    function renderRoomTasks() {
        const roomPlanContainer = document.getElementById("room-todays-plan");
        if (!roomPlanContainer) return;
        
        if (!userData.tasks || userData.tasks.length === 0) {
            roomPlanContainer.innerHTML = `<div style="font-size: 13px; color: var(--text-muted); font-style: italic;">No tasks crafted yet. Focus your mind.</div>`;
            return;
        }

        roomPlanContainer.innerHTML = userData.tasks.map((task, index) => {
            const progress = Math.min((task.currentProgress / task.targetValue) * 100, 100) || 0;
            return `
            <div class="plan-item" style="display:block; margin-bottom: 15px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:15px; font-family:'Nunito',sans-serif;">
                    <strong style="color:var(--navy-dark);">${index + 1}. ${task.name}</strong>
                    <small style="color:var(--text-muted); font-weight:bold;">${task.currentProgress || 0}/${task.targetValue}</small>
                </div>
                <div class="progress-bar" style="width: 100%; height: 6px; background: rgba(197, 160, 89, 0.2); border-radius: 3px;">
                    <div class="progress-fill" style="height: 100%; width: ${progress}%; background: ${task.done ? '#1f5c33' : '#b58d3c'}; border-radius: 3px;"></div>
                </div>
            </div>`;
        }).join('');
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
    const APP_ID = "8a735e3d22a7475babf205eab01d8859"; 
    let currentRoomId = "public-general";
    let agoraClient = null;
    let localTracks = { audioTrack: null, videoTrack: null, screenTrack: null };
    let mediaStates = { mic: false, cam: false, screen: false, joined: false };
    let remoteUsersMap = {};
    let isConnecting = false; // Connection lock to prevent double-firing

    // Generate a stable UID per device to prevent ghost cloning
    let localAgoraUid = localStorage.getItem("hp_agora_uid");
    if (!localAgoraUid) {
        localAgoraUid = Math.floor(Math.random() * 1000000) + 1;
        localStorage.setItem("hp_agora_uid", localAgoraUid);
    }

    const roomTypePopup = document.getElementById("room-type-popup");
    const viewSections = document.querySelectorAll(".view-section");
    const chatContainer = document.querySelector(".chat-container");
    const chatInput = document.querySelector(".chat-input-bar input");
    
    // --- Custom Navigation Hijack for Study Rooms Layout ---
    document.querySelectorAll(".sidebar nav a").forEach(link => {
        link.addEventListener("click", (e) => {
            const targetId = link.getAttribute("data-target");
            if (!targetId) return;
            
            e.preventDefault();
            
            // Fix 1: Handle Room Navigation Correctly
            if (targetId === "study-rooms-view") {
                if (mediaStates.joined) {
                    // Already in a room: Jump straight in, no popup!
                    if(roomTypePopup) roomTypePopup.classList.remove("show");
                    if (viewSections) viewSections.forEach(sec => sec.style.display = "none");
                    const targetView = document.getElementById("study-rooms-view");
                    if (targetView) targetView.style.display = "flex";
                    
                    document.querySelectorAll(".sidebar nav li").forEach(li => li.classList.remove("active"));
                    link.parentElement.classList.add("active");
                } else {
                    // Not in a room: Show popup
                    const linkRect = link.getBoundingClientRect();
                    if(roomTypePopup) {
                        roomTypePopup.style.top = `${linkRect.top}px`;
                        roomTypePopup.style.left = `${linkRect.right + 8}px`;
                        roomTypePopup.classList.toggle("show");
                    }
                }
                return;
            }
            
            // Handle Dashboard & Other Tabs
            if(roomTypePopup) roomTypePopup.classList.remove("show");
            if (viewSections) viewSections.forEach(sec => sec.style.display = "none");
            
            const targetView = document.getElementById(targetId);
            if (targetView) targetView.style.display = "flex";
            
            document.querySelectorAll(".sidebar nav li").forEach(li => li.classList.remove("active"));
            link.parentElement.classList.add("active");
        });
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest("nav") && !e.target.closest("#room-type-popup")) {
            if(roomTypePopup) roomTypePopup.classList.remove("show");
        }
    });

    window.switchRoomTab = (mode) => {
        document.getElementById("create-room-section").style.display = mode === "create" ? "block" : "none";
        document.getElementById("join-room-section").style.display = mode === "join" ? "block" : "none";
        document.getElementById("tab-create-room").classList.toggle("active", mode === "create");
        document.getElementById("tab-join-room").classList.toggle("active", mode === "join");
    };

    window.closePrivateRoomModal = () => {
        document.getElementById("private-room-modal").style.display = "none";
        document.getElementById("create-room-id").value = "";
        
        // Reset password fields to hidden
        const createPwd = document.getElementById("create-room-pwd");
        createPwd.value = "";
        createPwd.type = "password";
        
        document.getElementById("join-room-id").value = "";
        
        const joinPwd = document.getElementById("join-room-pwd");
        joinPwd.value = "";
        joinPwd.type = "password";

        // Reset icons back to default
        document.querySelectorAll(".password-toggle").forEach(icon => {
            icon.classList.remove("fa-eye-slash");
            icon.classList.add("fa-eye");
            icon.style.color = "var(--text-muted)";
        });
    };
    // --- Reveal Password Logic ---
    window.togglePasswordVisibility = (inputId, iconElement) => {
        const inputField = document.getElementById(inputId);
        if (inputField.type === "password") {
            inputField.type = "text";
            iconElement.classList.remove("fa-eye");
            iconElement.classList.add("fa-eye-slash");
            iconElement.style.color = "var(--gold)"; // Highlights the icon when visible
        } else {
            inputField.type = "password";
            iconElement.classList.remove("fa-eye-slash");
            iconElement.classList.add("fa-eye");
            iconElement.style.color = "var(--text-muted)";
        }
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

    // --- NEW: Cryptographic Password Hashing Utility ---
    async function hashPassword(password) {
        const msgBuffer = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // --- STRICT PRIVATE ROOM CREATION LOGIC ---
    window.handleCreatePrivateRoom = async () => {
        const id = document.getElementById("create-room-id").value.trim();
        const pwd = document.getElementById("create-room-pwd").value.trim();
        if(!id || !pwd) return alert("Must configure Room Code and Passphrase seals!");
        
        // 1. Password Complexity Rules (Min 8 chars, 1 Uppercase, 1 Lowercase, 1 Number, 1 Special)
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(pwd)) {
            return alert("Weak Spell! Passphrase must be at least 8 characters long and contain an uppercase letter, lowercase letter, number, and special character (@$!%*?&).");
        }

        // 2. Hash the password for secure Firestore storage
        const hashedPwd = await hashPassword(pwd);
        
        const roomRef = db.collection("rooms").doc(id);
        const roomDoc = await roomRef.get();

        if (roomDoc.exists) {
            const participants = await roomRef.collection("participants").get();
            if (!participants.empty) {
                return alert("This Room ID is currently active! Please choose a unique ID or join the existing room.");
            } else {
                // Room is completely abandoned. Wipe all old ghost data for a fresh start.
                const oldMsgs = await roomRef.collection("messages").get();
                oldMsgs.forEach(m => m.ref.delete());
                participants.forEach(p => p.ref.delete());
            }
        }
        
        // Send the hash to Firebase, NOT the plaintext password
        await roomRef.set({ password: hashedPwd, created: Date.now() });
        closePrivateRoomModal();
        enterStudyRoom(id);
    };

    window.handleJoinPrivateRoom = async () => {
        const id = document.getElementById("join-room-id").value.trim();
        const pwd = document.getElementById("join-room-pwd").value.trim();
        if(!id || !pwd) return alert("Credentials mandatory to break counter-hexes!");
        
        // Hash the user's input to compare against the secure database hash
        const hashedPwd = await hashPassword(pwd);
        
        const roomDoc = await db.collection("rooms").doc(id).get();
        if(!roomDoc.exists || roomDoc.data().password !== hashedPwd) {
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
            db.collection("rooms").doc(currentRoomId).collection("participants").doc(String(localAgoraUid)).delete();
        }
    });

    async function enterStudyRoom(roomId) {
        if (isConnecting) return; // Prevent double-clicks causing overlapping bugs
        isConnecting = true;
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

        // Fix 5 & 6: Clean Timers & Handle Private Room Sync Properly
        if (uiTimerInterval) { clearInterval(uiTimerInterval); uiTimerInterval = null; }
        if (roomStudyTimer) { clearInterval(roomStudyTimer); roomStudyTimer = null; }
        roomSeconds = 0;

        if (!isPublic) {
            const roomDoc = await db.collection("rooms").doc(roomId).get();
            if (roomDoc.exists && roomDoc.data().created) {
                roomSeconds = Math.floor((Date.now() - roomDoc.data().created) / 1000);
            }
        }

        const timerDisplay = document.getElementById("room-active-timer");
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
            
            // Join with stable local UID
            await agoraClient.join(APP_ID, currentRoomId, null, Number(localAgoraUid));
            mediaStates.joined = true;

            // Only request Microphone permission on join (keep camera completely off)
            if(!localTracks.audioTrack) localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
            await localTracks.audioTrack.setMuted(!mediaStates.mic);

            // Force UI Icons to default off states
            const camIcon = document.querySelector(".control-dock .dock-btn:nth-child(1) i");
            if(camIcon) camIcon.className = "fa-solid fa-video-slash";
            
            const micIcon = document.querySelector(".control-dock .dock-btn:nth-child(2) i");
            if(micIcon) micIcon.className = "fa-solid fa-microphone-slash";

            // Ensure canvas is hidden so avatar shows
            const trackDiv = document.getElementById("agora-local-container");
            if (trackDiv) trackDiv.style.display = "none";

            // Only publish audio track to the room
            await agoraClient.publish([localTracks.audioTrack]);
            const localCamImg = document.querySelector(".cam-preview-box img");
            if (localCamImg) localCamImg.src = userData.avatar;
            
            await db.collection("rooms").doc(currentRoomId).collection("participants").doc(String(localAgoraUid)).set({
                name: userData.name || "Mischief Managed",
                house: userData.house || "Ravenclaw",
                camActive: mediaStates.cam,
                timestamp: Date.now()
            });

            // Sync main dashboard stats live from room
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
            // This will now show the REAL error on your screen
            alert("Room Connection Error: " + (err.message || err.code || err)); 
        } finally {
            isConnecting = false;
        }
    }

    // Bind Active Controls Interfaces
    const camBtn = document.querySelector(".control-dock .dock-btn:nth-child(1)");
    if (camBtn) {
        camBtn.onclick = async () => {
            // 1. If camera track doesn't exist, create it NOW
            if(!localTracks.videoTrack) {
                try {
                    localTracks.videoTrack = await AgoraRTC.createCameraVideoTrack();
                    
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
                    if(mediaStates.joined) await agoraClient.publish([localTracks.videoTrack]);
                } catch (e) {
                    console.error("Camera access denied or missing:", e);
                    return;
                }
            }

            mediaStates.cam = !mediaStates.cam;
            
            // 2. Use setEnabled to completely turn off the hardware light when disabled
            await localTracks.videoTrack.setEnabled(mediaStates.cam);
            
            const previewWrap = document.querySelector(".cam-preview-box");
            if (previewWrap) previewWrap.classList.toggle("cam-active", mediaStates.cam);
            
            const trackDiv = document.getElementById("agora-local-container");
            if (trackDiv) trackDiv.style.display = mediaStates.cam ? "block" : "none";

            const camIcon = document.querySelector(".control-dock .dock-btn:nth-child(1) i");
            if(camIcon) camIcon.className = mediaStates.cam ? "fa-solid fa-video" : "fa-solid fa-video-slash";
            
            if(mediaStates.joined) {
                db.collection("rooms").doc(currentRoomId).collection("participants").doc(String(localAgoraUid)).update({ camActive: mediaStates.cam });
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
            if (roomStudyTimer) { clearInterval(roomStudyTimer); roomStudyTimer = null; }
            if (uiTimerInterval) { clearInterval(uiTimerInterval); uiTimerInterval = null; }
            
            const timerDisplay = document.getElementById("room-active-timer");
            if(timerDisplay) timerDisplay.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> 00:00:00`;

            if(agoraClient && mediaStates.joined) {
                await db.collection("rooms").doc(currentRoomId).collection("participants").doc(String(localAgoraUid)).delete();
                await agoraClient.leave();
            }
            if(agoraClient && mediaStates.joined) {
                await db.collection("rooms").doc(currentRoomId).collection("participants").doc(String(localAgoraUid)).delete();
                await agoraClient.leave();
            }

            // --- NEW: Completely shut down hardware devices ---
            if (localTracks.videoTrack) {
                localTracks.videoTrack.stop();
                localTracks.videoTrack.close();
                localTracks.videoTrack = null;
            }
            if (localTracks.audioTrack) {
                localTracks.audioTrack.stop();
                localTracks.audioTrack.close();
                localTracks.audioTrack = null;
            }
            if (localTracks.screenTrack) {
                localTracks.screenTrack.stop();
                localTracks.screenTrack.close();
                localTracks.screenTrack = null;
            }
            mediaStates.cam = false;
            mediaStates.mic = false;
            mediaStates.screen = false;
            // ---------------------------------------------------

            mediaStates.joined = false;
            
            // Go back to home dashboard view
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
            // Fix Ghost issue: forcefully scrub Firebase if Agora detects drop
            db.collection("rooms").doc(currentRoomId).collection("participants").doc(String(user.uid)).delete();
            renderGridLayoutCells();
        });
    };

    function renderGridLayoutCells() {
        const gridLayout = document.getElementById("main-grid-layout");
        if(!gridLayout) return;
        
        gridLayout.innerHTML = ""; 
        
        Object.keys(remoteUsersMap).forEach(uid => {
            const user = remoteUsersMap[uid];
            // Auto hide avatar if video is streaming
            const hasVideoClass = user.hasVideo ? 'cam-active' : '';
            
            const cell = document.createElement("div");
            cell.className = `grid-cell ${hasVideoClass}`;
            cell.id = `remote-cell-${uid}`;
            cell.innerHTML = `
                <div id="agora-remote-${uid}" class="agora-remote-stream"></div>
                <!-- Replaced hardcoded Dicebear with default placeholder and dynamic ID -->
                <img id="grid-img-${uid}" src="https://www.gravatar.com/avatar/?d=mp" alt="Wizard">
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
            const peopleContainer = document.getElementById("people-section-block");
            if (peopleContainer) peopleContainer.innerHTML = ""; // Clear list

            snap.forEach(docSnap => {
                participantCount++;
                const uid = docSnap.id;
                const data = docSnap.data();

                // Build dynamic list in the People Tab
                const validParticipantAvatar = (data.avatar && data.avatar !== "undefined" && data.avatar !== "null") 
                    ? data.avatar 
                    : `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(data.name)}&backgroundColor=1b263b`;

                if (peopleContainer) {
                    const isMe = String(localAgoraUid) === uid;
                    const personItem = document.createElement("div");
                    personItem.className = "list-item";
                    personItem.innerHTML = `
                        <!-- Inject Real Firebase Avatar or Safe Fallback -->
                        <img src="${validParticipantAvatar}" class="avatar-img" style="width:36px; height:36px; border:2px solid var(--gold); border-radius:50%; object-fit:cover;" alt="User">
                        <div class="item-text">
                            <div class="item-title" style="font-size:14.5px;">${data.name} ${isMe ? "(You)" : ""}</div>
                            <div class="item-subtitle">${data.house}</div>
                        </div>
                        <div>
                            <i class="fa-solid ${data.camActive ? 'fa-video' : 'fa-video-slash'}" style="color: ${data.camActive ? 'var(--gold)' : 'var(--text-muted)'}; font-size: 13px; margin-right: 5px;"></i>
                        </div>
                    `;
                    peopleContainer.appendChild(personItem);
                }
                
                if(String(localAgoraUid) === uid) return; // Don't override local grid properties
                
                const label = document.getElementById(`label-${uid}`);
                if(label) label.innerText = `${data.name} (${data.house})`;

                // --- Update Grid Cell Image with Real Avatar ---
                const gridImg = document.getElementById(`grid-img-${uid}`);
                if (gridImg) gridImg.src = validParticipantAvatar;
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
                  const validChatAvatar = (msg.avatar && msg.avatar !== "undefined" && msg.avatar !== "null") 
                      ? msg.avatar 
                      : `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(msg.senderName)}&backgroundColor=d4ad8c`;

                  item.innerHTML = `
                      <!-- Use Validated Message Avatar -->
                      <img src="${validChatAvatar}" class="avatar-img" style="border-radius:50%; object-fit:cover;" alt="Avatar">
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
            avatar: userData.avatar, // --- NEW: Attach Avatar to message ---
            timestamp: Date.now()
        });
    }

    const chatSendBtn = document.querySelector(".chat-icons .fa-paper-plane");
    if(chatSendBtn) chatSendBtn.onclick = submitChatMessage;
    
    const chatInputElem = document.querySelector(".chat-input-bar input");
    if(chatInputElem) {
        chatInputElem.onkeypress = (e) => { if(e.key === "Enter") submitChatMessage(); };
    }

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

    const tabChat = document.querySelector(".tabs-header .tab:nth-child(1)");
    const tabPeople = document.querySelector(".tabs-header .tab:nth-child(2)");
    const chatSection = document.getElementById("chat-section-block");
    const peopleSection = document.getElementById("people-section-block");
    
    if (tabChat && tabPeople) {
        tabChat.addEventListener("click", () => {
            tabChat.classList.add("active");
            tabPeople.classList.remove("active");
            if (chatSection) chatSection.style.display = "flex";
            if (peopleSection) peopleSection.style.display = "none";
        });
        
        tabPeople.addEventListener("click", () => {
            tabPeople.classList.add("active");
            tabChat.classList.remove("active");
            if (chatSection) chatSection.style.display = "none";
            if (peopleSection) peopleSection.style.display = "flex";
            // Fix 1: Removed window.toggleView() so it doesn't hijack the main screen!
        });
    }

    initializeUserDashboard();
});