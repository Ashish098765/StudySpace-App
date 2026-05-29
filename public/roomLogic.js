import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, updateDoc, setDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ⚠️ YOUR FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyAN5R8PaIBuC9BxP52IW_EwkurHBOkYxxU",
    authDomain: "studyspace-45780.firebaseapp.com",
    projectId: "studyspace-45780",
    storageBucket: "studyspace-45780.firebasestorage.app",
    messagingSenderId: "212493442342",
    appId: "1:212493442342:web:15b83a52a04bbf8567b5e7",
    measurementId: "G-NVHDFF8JDN"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
window.auth = auth; 

// --- 1. UI SETUP & TIMER ---
const urlParams = new URLSearchParams(window.location.search);
const ROOM_ID = urlParams.get('id') || 'public-general'; 

const roomTitleDisplay = document.getElementById('room-id-display');
const activityWarning = document.getElementById('activity-warning');
const timerDisplay = document.getElementById('timer-display');
const videoGrid = document.getElementById('video-grid');

const btnMic = document.getElementById('btn-mic');
const btnCam = document.getElementById('btn-cam');
const btnScreen = document.getElementById('btn-screen');
const btnJoin = document.getElementById('btn-join');

// FIX 1: Force the Join button to be visible immediately on load!
if (btnJoin) btnJoin.style.display = 'flex';

let secondsSpent = 0;
setInterval(() => {
    secondsSpent++;
    const mins = Math.floor(secondsSpent / 60).toString().padStart(2, '0');
    const secs = (secondsSpent % 60).toString().padStart(2, '0');
    if (timerDisplay) timerDisplay.innerText = `${mins}:${secs}`;
}, 1000);

// --- 2. ROOM RULES ---
const publicRooms = {
    'public-general': '📚 General Study Lounge (Mic Off)',
    'public-pomodoro': '🍅 Pomodoro Focus (Mic Off)',
    'public-quiet': '🤫 Quiet Reading Room (Mic Off)'
};
const isPublicRoom = ROOM_ID.startsWith('public-');

if (publicRooms[ROOM_ID]) {
    roomTitleDisplay.innerHTML = publicRooms[ROOM_ID];
} else {
    roomTitleDisplay.innerHTML = `<i class="fa-solid fa-lock"></i> Room Code: <span style="color: var(--primary); letter-spacing: 2px;">${ROOM_ID}</span>`;
}

let inactivityTimer;
if (isPublicRoom) {
    activityWarning.style.display = 'block';
    inactivityTimer = setTimeout(() => {
        alert("Removed for inactivity.");
        window.location.href = '/'; 
    }, 120000);
}

function stopKickTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (activityWarning) activityWarning.style.display = 'none';
}

// --- 3. DISCORD GRID SCALING ---
function adjustGrid() {
    const count = videoGrid.children.length;
    if (count === 1) videoGrid.style.gridTemplateColumns = "minmax(300px, 800px)";
    else if (count === 2) videoGrid.style.gridTemplateColumns = "repeat(2, minmax(300px, 1fr))";
    else if (count <= 4) videoGrid.style.gridTemplateColumns = "repeat(2, minmax(300px, 1fr))";
    else videoGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(300px, 1fr))";
}

// --- 4. AGORA WEB-RTC ENGINE ---
const AGORA_APP_ID = "8a735e3d22a7475babf205eab01d8859";
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

let localAudioTrack = null;
let localVideoTrack = null;
let localScreenTrack = null;

let isMicOn = false;
let isCamOn = false;
let isConnected = false;
let myUid = null;

function updateButtonStates() {
    btnMic.className = isMicOn ? "btn-media btn-on" : "btn-media btn-off";
    btnMic.innerHTML = isMicOn ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
    
    btnCam.className = isCamOn ? "btn-media btn-on" : "btn-media btn-off";
    btnCam.innerHTML = isCamOn ? '<i class="fa-solid fa-video"></i>' : '<i class="fa-solid fa-video-slash"></i>';
}

function createVideoWrapper(uid, label) {
    const wrapper = document.createElement('div');
    wrapper.className = 'video-container';
    wrapper.id = `user-${uid}`; 

    const badge = document.createElement('div');
    badge.className = 'name-badge';
    badge.innerText = label;

    wrapper.appendChild(badge);
    videoGrid.append(wrapper);
    adjustGrid();

    return wrapper; 
}

// 4a. Media Setup
async function ensureMedia() {
    if (localVideoTrack) return true; 
    try {
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localVideoTrack = await AgoraRTC.createCameraVideoTrack();
        
        await localAudioTrack.setMuted(true);
        isMicOn = false;
        isCamOn = true; 

        createVideoWrapper('local', 'You (Preview)');
        localVideoTrack.play('user-local');

        updateButtonStates();
        return true;
    } catch(e) { 
        console.error(e);
        alert("Camera and Microphone access is required to join the room."); 
        return false; 
    }
}

// --- BUTTON EVENTS ---

btnCam.addEventListener('click', async () => {
    if (!(await ensureMedia())) return;
    isCamOn = !isCamOn;
    await localVideoTrack.setEnabled(isCamOn);
    updateButtonStates();
});

btnMic.addEventListener('click', async () => {
    if (isPublicRoom) {
        return alert("🔇 Microphones are disabled in Public Rooms to maintain a quiet study environment.");
    }
    if (!(await ensureMedia())) return;
    isMicOn = !isMicOn;
    await localAudioTrack.setMuted(!isMicOn); 
    updateButtonStates();
});

// THE ACTUAL JOIN TRIGGER
btnJoin.addEventListener('click', async () => {
    if (isConnected) return;
    stopKickTimer();
    
    // Ensure media exists before joining
    const hasMedia = await ensureMedia();
    if (!hasMedia) return;
    
    const originalText = btnJoin.innerHTML;
    btnJoin.innerHTML = "Joining...";
    btnJoin.disabled = true;
    
    try {
        // Join the Agora Channel
        myUid = await client.join(AGORA_APP_ID, ROOM_ID, null, null);
        isConnected = true;
        
        // Broadcast your video and audio to the room!
        await client.publish([localAudioTrack, localVideoTrack]);
        
        // Update UI
        document.querySelector('#user-local .name-badge').innerText = "You";
        btnJoin.style.display = 'none'; 
        
    } catch (e) {
        console.error("AGORA JOIN ERROR:", e);
        alert("Failed to join room. Error: " + e.message + "\n\nCRITICAL FIX: If this says 'Token is invalid', you need to go to Agora.io, delete this project, and create a new one set to 'TESTING MODE' (App ID Only).");
        btnJoin.innerHTML = originalText;
        btnJoin.disabled = false;
    }
});

// THE SCREENSHARE ENGINE
btnScreen.addEventListener('click', async () => {
    if (!isConnected) return alert("Please click 'Join Room' before sharing your screen!");
    
    try {
        if (!localScreenTrack) {
            // FIX 2: Safely handle Agora arrays for Screensharing
            const screenResult = await AgoraRTC.createScreenVideoTrack({}, "auto");
            localScreenTrack = Array.isArray(screenResult) ? screenResult[0] : screenResult;
            
            // Swap what we are broadcasting
            await client.unpublish([localVideoTrack]);
            await client.publish([localScreenTrack]);
            
            // Swap what we see locally
            localVideoTrack.stop();
            localScreenTrack.play('user-local');
            btnScreen.className = "btn-media btn-on";

            // If the user clicks the native browser "Stop Sharing" popup
            localScreenTrack.on("track-ended", async () => {
                await client.unpublish([localScreenTrack]);
                localScreenTrack.close();
                localScreenTrack = null;

                // Restore webcam
                await client.publish([localVideoTrack]);
                localVideoTrack.play('user-local');
                btnScreen.className = "btn-media btn-off";
            });
        } else {
            // Manual toggle off
            await client.unpublish([localScreenTrack]);
            localScreenTrack.close();
            localScreenTrack = null;

            await client.publish([localVideoTrack]);
            localVideoTrack.play('user-local');
            btnScreen.className = "btn-media btn-off";
        }
    } catch (e) { 
        console.error("Screenshare cancelled or failed.", e); 
    }
});

// --- 5. HANDLING OTHER STUDENTS ---

client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);

    if (mediaType === "video") {
        let wrapper = document.getElementById(`user-${user.uid}`);
        if (!wrapper) wrapper = createVideoWrapper(user.uid, "Student");
        
        user.videoTrack.play(wrapper.id);
    }
    if (mediaType === "audio") {
        user.audioTrack.play();
    }
});

client.on("user-left", (user) => {
    const wrapper = document.getElementById(`user-${user.uid}`);
    if (wrapper) {
        wrapper.remove();
        adjustGrid();
    }
});

// --- 6. AGORA SPEECH HIGHLIGHT ---
client.enableAudioVolumeIndicator();
client.on("volume-indicator", volumes => {
    volumes.forEach((volume) => {
        const targetId = volume.uid === myUid ? 'local' : volume.uid;
        const wrapper = document.getElementById(`user-${targetId}`);
        if (wrapper) {
            if (volume.level > 20) wrapper.classList.add('speaking');
            else wrapper.classList.remove('speaking');
        }
    });
});

// --- 7. XP TRACKING ---
window.onbeforeunload = async () => {
    const user = window.auth?.currentUser;
    if (user && secondsSpent >= 60) {
        const xpEarned = Math.floor(secondsSpent / 60) * 10;
        const userRef = doc(db, "users", user.uid);
        try {
            await updateDoc(userRef, { xp: increment(xpEarned), lastActive: new Date() });
        } catch (e) {
            await setDoc(userRef, { name: user.displayName || 'Student', xp: xpEarned, lastActive: new Date() });
        }
    }
    
    if (localAudioTrack) localAudioTrack.close();
    if (localVideoTrack) localVideoTrack.close();
    if (localScreenTrack) localScreenTrack.close();
    await client.leave();
};