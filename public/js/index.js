// --- SECURE LAMBDA BACKEND CONFIGURATION ---
const LAMBDA_URL = "https://nvq32ao6fel7xdvfcjhzatg5ja0reeqs.lambda-url.us-east-1.on.aws/";

// --- FIREBASE AUTH IMPORTS ONLY ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyB57PcjYtWktsOGKFLQmWX-Nc6HtYeZxp8",
    authDomain: "studyspace-f6e22.firebaseapp.com",
    projectId: "studyspace-f6e22",
    storageBucket: "studyspace-f6e22.firebasestorage.app",
    messagingSenderId: "498741408880",
    appId: "1:498741408880:web:bd5fdea00d10e9329130b5",
    measurementId: "G-J1X8Y7KDQV"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
window.auth = auth;

// --- 2. AUTHENTICATION UI LOGIC ---
const loginBtn = document.getElementById('nav-login-btn');
const profileContainer = document.getElementById('user-profile-container');
const profileName = document.getElementById('profile-name');
const profileEmail = document.getElementById('profile-email'); 
const profileAvatar = document.getElementById('user-avatar');
const logoutBtn = document.getElementById('logout-btn');

onAuthStateChanged(auth, (user) => {
    if (user) {
        if(loginBtn) loginBtn.style.display = 'none';
        if(profileContainer) profileContainer.style.display = 'flex';
        if(profileName) profileName.textContent = user.displayName || 'Student';
        if(profileEmail) profileEmail.textContent = user.email || 'No Email'; 
        if(profileAvatar && user.photoURL) profileAvatar.src = user.photoURL;
    } else {
        if(loginBtn) loginBtn.style.display = 'block';
        if(profileContainer) profileContainer.style.display = 'none';
    }
});

if(logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => window.location.reload());
    });
}

// --- 3. SECURE LEADERBOARD VIA LAMBDA ---
function forceNumber(val) {
    const num = parseInt(val);
    if (isNaN(num)) return 0;
    return num;
}

async function loadLeaderboard() {
    const container = document.getElementById('leaderboard-list');
    if (!container) return; 

    try {
        const response = await fetch(LAMBDA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'getLeaderboard' })
        });

        if (!response.ok) throw new Error("Lambda response was not ok");
        const topUsers = await response.json();
        
        container.innerHTML = ""; 
        let rank = 1; 
        
        topUsers.forEach((user) => {
            const cleanXP = forceNumber(user.xp);
            const safeName = user.name || "Student";
            
            let rankColor = "var(--text-muted)";
            if(rank === 1) rankColor = "#fbbf24"; 
            if(rank === 2) rankColor = "#94a3b8"; 
            if(rank === 3) rankColor = "#b45309"; 

            container.innerHTML += `
                <div class="list-item">
                    <span><strong style="color: ${rankColor}; margin-right: 12px; font-size: 1.1rem;">#${rank}</strong> ${safeName}</span>
                    <span style="background: rgba(16, 185, 129, 0.1); color: var(--accent); padding: 4px 10px; border-radius: 99px; font-size: 0.8rem; font-weight: 600;">${cleanXP} XP</span>
                </div>
            `;
            rank++; 
        });

        setTimeout(async () => {
            if (window.auth && window.auth.currentUser) {
                const uid = window.auth.currentUser.uid;
                let myXP = 0;
                let myName = window.auth.currentUser.displayName || 'Student';

                try {
                    const token = await window.auth.currentUser.getIdToken();
                    const userRes = await fetch(LAMBDA_URL, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}` 
                        },
                        body: JSON.stringify({ action: 'getUserData', uid: uid })
                    });

                    if (userRes.ok) {
                        const userData = await userRes.json();
                        if (userData) {
                            myXP = forceNumber(userData.xp);
                            myName = userData.name || myName;
                        }
                    }

                    container.innerHTML += `
                        <div style="display: flex; align-items: center; text-align: center; margin: 1.5rem 0 1rem 0; color: var(--text-muted); font-size: 0.75rem; letter-spacing: 1px;">
                            <div style="flex: 1; border-bottom: 1px solid var(--border-subtle);"></div>
                            <span style="padding: 0 10px; font-weight: 600;">YOUR RANK</span>
                            <div style="flex: 1; border-bottom: 1px solid var(--border-subtle);"></div>
                        </div>
                        <div class="list-item" style="background: rgba(99, 102, 241, 0.1) !important; border: 1px solid rgba(99, 102, 241, 0.3) !important;">
                            <span style="color: var(--text-main); font-weight: 500;"><i class="fa-solid fa-user" style="color: #818cf8; margin-right: 12px;"></i>${myName}</span>
                            <span style="background: var(--primary); color: white; padding: 4px 10px; border-radius: 99px; font-size: 0.8rem; font-weight: 600;">${myXP} XP</span>
                        </div>
                    `;
                } catch (e) {
                    console.error("Failed to load user's personal rank data", e);
                }
            }
        }, 1000); 

    } catch (error) {
        console.error("Failed to fetch leaderboard", error);
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--error-red);">Failed to connect to backend service.</div>';
    }
}

loadLeaderboard();

// --- 4. EXPOSED WINDOW FUNCTIONS ---
window.checkLogin = function() {
    if (!window.auth || !window.auth.currentUser) {
        sessionStorage.setItem('returnUrl', window.location.href);
        window.location.href = '/login.html';
        return false;
    }
    return true;
};

window.createPrivateRoom = function() {
    if (!window.checkLogin()) return; 
    const numericalCode = Math.floor(100000 + Math.random() * 900000).toString();
    window.location.href = `/room.html?id=${numericalCode}`;
};

window.joinPrivateRoom = function() {
    if (!window.checkLogin()) return; 
    document.getElementById('join-modal').classList.add('active');
    const input = document.getElementById('join-room-input');
    if(input) {
        input.placeholder = "Enter 6-digit code (e.g. 123456)";
        input.focus();
    }
};

window.closeJoinModal = function() {
    document.getElementById('join-modal').classList.remove('active');
};

window.submitJoinRoom = function() {
    if (!window.checkLogin()) return; 
    const input = document.getElementById('join-room-input').value.trim();
    if (!input) return;

    let roomId = input;
    
    if (input.includes('id=')) {
        roomId = input.split('id=')[1].split('&')[0];
    } else if (input.includes('/room/')) {
        roomId = input.split('/room/').pop();
    }
    
    roomId = roomId.replace(/\//g, '');

    if (roomId) {
        window.location.href = `/room.html?id=${roomId}`;
    }
};