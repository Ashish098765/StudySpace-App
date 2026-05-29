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

let secondsSpent = 0;
setInterval(() => {
    secondsSpent++;
    const mins = Math.floor(secondsSpent / 60).toString().padStart(2, '0');
    const secs = (secondsSpent % 60).toString().padStart(2, '0');
    if (timerDisplay) timerDisplay.innerText = `${mins}:${secs}`;
}, 1000);

// --- 2. ROOM RULES (Public Mic Ban & Kick) ---
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
    activityWarning.style.display = 'none';
}

// --- 3. DISCORD GRID SCALING ---
function adjustGrid() {
    const count = videoGrid.children.length;
    if (count === 1) videoGrid.style.gridTemplateColumns = "minmax(300px, 800px)";
    else if (count === 2) videoGrid.style.gridTemplateColumns = "repeat(2, minmax(300px, 1fr))";
    else if (count <= 4) videoGrid.style.gridTemplateColumns = "repeat(2, minmax(300px, 1fr))";
    else videoGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(300px, 1fr))";
}

// --- 4. AGORA WEB-RTC ENGINE (SERVERLESS) ---
const AGORA_APP_ID = "1f9a1a3a5a584354981fd9477e3051c0";
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

// Universal UI Box Creator
function createVideoWrapper(uid, label) {
    const wrapper = document.createElement('div');
    wrapper.className = 'video-container';
    wrapper.id = `user-${uid}`; // Agora will inject the video tag inside this ID

    const badge = document.createElement('div');
    badge.className = 'name-badge';
    badge.innerText = label;

    wrapper.appendChild(badge);
    videoGrid.append(wrapper);
    adjustGrid();

    return wrapper; 
}

// 4a. The Lobby Preview Trigger
async function ensureMedia() {
    if (localVideoTrack) return true;
    try {
        // Agora creates tracks individually
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localVideoTrack = await AgoraRTC.createCameraVideoTrack();
        
        // Start Muted
        await localAudioTrack.setMuted(true);
        isMicOn = false;
        isCamOn = true; 

        // Create UI and play local video
        const wrapper = createVideoWrapper('local', 'You (Preview)');
        localVideoTrack.play(wrapper.id);

        btnJoin.style.display = 'flex'; 
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
    await localAudioTrack.setMuted(!isMicOn); // True = muted, False = unmuted
    updateButtonStates();
});

// The Actual Join Trigger
btnJoin.addEventListener('click', async () => {
    if (isConnected) return;
    stopKickTimer();
    
    document.querySelector('#user-local .name-badge').innerText = "You";
    btnJoin.style.display = 'none'; 
    
    try {
        // Join the Agora Channel
        myUid = await client.join(AGORA_APP_ID, ROOM_ID, null, null);
        isConnected = true;
        
        // Broadcast your video and audio to the room!
        await client.publish([localAudioTrack, localVideoTrack]);
    } catch (e) {
        alert("Failed to join the room. Please try again.");
    }
});

// The Screenshare Engine (Much easier with Agora)
btnScreen.addEventListener('click', async () => {
    if (!isConnected) return alert("Please click 'Join Room' before sharing your screen!");
    
    try {
        if (!localScreenTrack) {
            localScreenTrack = await AgoraRTC.createScreenVideoTrack({}, "auto");
            
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
        }
    } catch (e) { 
        console.error("Screenshare cancelled or failed.", e); 
    }
});

// --- 5. HANDLING OTHER STUDENTS IN THE ROOM ---

client.on("user-published", async (user, mediaType) => {
    // Automatically receive their stream
    await client.subscribe(user, mediaType);

    if (mediaType === "video") {
        let wrapper = document.getElementById(`user-${user.uid}`);
        if (!wrapper) wrapper = createVideoWrapper(user.uid, "Student");
        
        // Agora plays the video inside our wrapper automatically
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

// --- 6. AGORA SPEECH HIGHLIGHT ENGINE ---
client.enableAudioVolumeIndicator();
client.on("volume-indicator", volumes => {
    volumes.forEach((volume) => {
        // Map our local UID to the 'local' string we used for our own UI box
        const targetId = volume.uid === myUid ? 'local' : volume.uid;
        const wrapper = document.getElementById(`user-${targetId}`);
        if (wrapper) {
            // Threshold is 0-100. 20 is a good baseline for speaking.
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
    
    // Cleanup Agora streams on exit
    if (localAudioTrack) localAudioTrack.close();
    if (localVideoTrack) localVideoTrack.close();
    if (localScreenTrack) localScreenTrack.close();
    await client.leave();
};