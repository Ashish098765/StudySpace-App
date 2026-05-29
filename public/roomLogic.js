import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
// FIX: Imported all the necessary tools for Real-time Chat and Name Syncing
import { getFirestore, doc, updateDoc, setDoc, getDoc, increment, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

function adjustGrid() {
    const count = videoGrid.children.length;
    if (count === 1) videoGrid.style.gridTemplateColumns = "minmax(250px, 800px)";
    else if (count === 2) videoGrid.style.gridTemplateColumns = "repeat(2, minmax(250px, 1fr))";
    else if (count <= 4) videoGrid.style.gridTemplateColumns = "repeat(2, minmax(250px, 1fr))";
    else videoGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(250px, 1fr))";
}

// --- 3. AGORA ENGINE & NAME SYNC ---
const AGORA_APP_ID = "1f9a1a3a5a584354981fd9477e3051c0";
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

let localAudioTrack = null;
let localVideoTrack = null;
let localScreenTrack = null;

let isMicOn = false;
let isCamOn = false;
let isConnected = false;
let myUid = null;
let myName = "Student"; 

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
        alert("Camera and Microphone access is required to join the room."); 
        return false; 
    }
}

// --- MEDIA BUTTONS ---
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

btnScreen.addEventListener('click', async () => {
    if (!isConnected) return alert("Please click 'Join Room' before sharing your screen!");
    try {
        if (!localScreenTrack) {
            const screenResult = await AgoraRTC.createScreenVideoTrack({}, "auto");
            localScreenTrack = Array.isArray(screenResult) ? screenResult[0] : screenResult;
            
            await client.unpublish([localVideoTrack]);
            await client.publish([localScreenTrack]);
            
            localVideoTrack.stop();
            localScreenTrack.play('user-local');
            btnScreen.className = "btn-media btn-on";

            localScreenTrack.on("track-ended", async () => {
                await client.unpublish([localScreenTrack]);
                localScreenTrack.close();
                localScreenTrack = null;
                await client.publish([localVideoTrack]);
                localVideoTrack.play('user-local');
                btnScreen.className = "btn-media btn-off";
            });
        } else {
            await client.unpublish([localScreenTrack]);
            localScreenTrack.close();
            localScreenTrack = null;
            await client.publish([localVideoTrack]);
            localVideoTrack.play('user-local');
            btnScreen.className = "btn-media btn-off";
        }
    } catch (e) { console.error("Screenshare cancelled.", e); }
});

// --- THE ACTUAL JOIN TRIGGER ---
btnJoin.addEventListener('click', async () => {
    if (isConnected) return;
    stopKickTimer();
    
    if (!(await ensureMedia())) return;
    
    const originalText = btnJoin.innerHTML;
    btnJoin.innerHTML = "Joining...";
    btnJoin.disabled = true;
    
    try {
        // 1. Join Agora
        myUid = await client.join(AGORA_APP_ID, ROOM_ID, null, null);
        isConnected = true;
        
        // 2. Write our exact Name and Agora UID to Firebase so others can identify us
        myName = window.auth?.currentUser?.displayName || "Student";
        await setDoc(doc(db, "rooms", ROOM_ID, "users", String(myUid)), { name: myName });
        
        await client.publish([localAudioTrack, localVideoTrack]);
        
        document.querySelector('#user-local .name-badge').innerText = `${myName} (You)`;
        btnJoin.style.display = 'none'; 
        
    } catch (e) {
        alert("Failed to join room.");
        btnJoin.innerHTML = originalText;
        btnJoin.disabled = false;
    }
});


// --- 4. HANDLING OTHER STUDENTS ---
client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);

    if (mediaType === "video") {
        let wrapper = document.getElementById(`user-${user.uid}`);
        
        if (!wrapper) {
            // FIX: Ask Firebase what this user's display name is!
            let studentName = "Student";
            try {
                const userDoc = await getDoc(doc(db, "rooms", ROOM_ID, "users", String(user.uid)));
                if (userDoc.exists()) studentName = userDoc.data().name;
            } catch (e) { console.log("Could not fetch name."); }
            
            wrapper = createVideoWrapper(user.uid, studentName);
        }
        
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

// --- 5. AGORA SPEECH HIGHLIGHT ---
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

// --- 6. REAL-TIME CHAT SYSTEM ---
const btnChat = document.getElementById('btn-chat');
const btnCloseChat = document.getElementById('btn-close-chat');
const chatPanel = document.getElementById('chat-panel');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const chatMessages = document.getElementById('chat-messages');

// Toggle UI
function toggleChat() {
    chatPanel.classList.toggle('open');
    if (chatPanel.classList.contains('open')) chatInput.focus();
}
btnChat.addEventListener('click', toggleChat);
btnCloseChat.addEventListener('click', toggleChat);

// Listen for incoming messages
const messagesQuery = query(collection(db, "rooms", ROOM_ID, "messages"), orderBy("time", "asc"));
onSnapshot(messagesQuery, (snapshot) => {
    chatMessages.innerHTML = ''; // Clear and rebuild
    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const isSelf = data.sender === myName;
        
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${isSelf ? 'self' : ''}`;
        msgDiv.innerHTML = `
            <div class="msg-sender">${isSelf ? 'You' : data.sender}</div>
            <div class="msg-text">${data.text}</div>
        `;
        chatMessages.appendChild(msgDiv);
    });
    // Auto-scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Send Message
async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !isConnected) return; // Must be joined to chat
    
    chatInput.value = ''; // Clear input instantly for UI speed
    await addDoc(collection(db, "rooms", ROOM_ID, "messages"), {
        text: text,
        sender: myName,
        time: serverTimestamp()
    });
}
btnSend.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
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