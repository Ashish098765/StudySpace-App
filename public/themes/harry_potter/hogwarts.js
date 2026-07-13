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
    // --- NEW: VIEW NAVIGATION LOGIC (SPA TOGGLING) ---
    const navLinks = document.querySelectorAll(".sidebar nav a");
    const viewSections = document.querySelectorAll(".view-section");

    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            const targetId = link.getAttribute("data-target");
            
            // If it has a data-target, handle it as an internal toggle
            if (targetId) {
                e.preventDefault(); // Stop normal link behavior

                // 1. Hide all view sections
                viewSections.forEach(section => {
                    section.style.display = "none";
                });

                // 2. Show the targeted section
                const targetView = document.getElementById(targetId);
                if (targetView) {
                    targetView.style.display = "flex"; // Using flex to match the CSS class
                }

                // 3. Update active state in sidebar
                document.querySelectorAll(".sidebar nav li").forEach(li => {
                    li.classList.remove("active");
                });
                link.parentElement.classList.add("active");
            }
        });
    });

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
                    setTimeout(() => alert(`✨ Magical! You completed your daily task: ${task.name}!`), 500);
                }
            }
            localStorage.removeItem("active_task_id");
            changed = true;
        }

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
        const deleteBtn = document.getElementById("modal-btn-delete");
        deleteBtn.style.display = "inline-block";
        deleteBtn.onclick = () => {
            if(confirm(`Are you sure you want to delete "${task.name}"?`)) {
                userData.tasks = userData.tasks.filter(t => t.id !== taskId);
                syncDataToFirebase();
                renderDashboard();
                closeTaskModal();
            }
        };
        
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

    initializeUserDashboard();
});
