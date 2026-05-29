import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, updateDoc, setDoc, increment, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// --- AGORA CONFIGURATION ---
// ⚠️ MUST BE A "TESTING MODE" APP ID FROM AGORA CONSOLE
const APP_ID = "8a735e3d22a7475babf205eab01d8859"; 

// --- FIREBASE CONFIGURATION ---
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

// --- 1. UI SETUP ---
const urlParams = new URLSearchParams(window.location.search);
const ROOM_ID = urlParams.get('id') || 'public-general';

const roomTitleDisplay = document.getElementById('room-id-display');
const videoGrid = document.getElementById('video-grid');
const localPlayerWrapper = document.getElementById('local-player-wrapper');

const btnMic = document.getElementById('btn-mic');
const btnCam = document.getElementById('btn-cam');
const btnJoin = document.getElementById('btn-join');

let localAudioTrack = null;
let localVideoTrack = null;
let isMicOn = false;
let isCamOn = false;
let isJoined = false;

// Room Title Logic
const publicRooms = {
    'public-general': '📚 General Study Lounge',
    'public-pomodoro': '🍅 Pomodoro Focus',
    'public-quiet': '🤫 Quiet Reading Room'
};
const isPublicRoom = ROOM_ID.startsWith('public-');
roomTitleDisplay.innerHTML = publicRooms[ROOM_ID] || `<i class="fa-solid fa-lock"></i> Room Code: <span style="color: var(--primary); letter-spacing: 2px;">${ROOM_ID}</span>`;

// Timer Logic
let secondsSpent = 0;
setInterval(() => {
    secondsSpent++;
    const mins = Math.floor(secondsSpent / 60).toString().padStart(2, '0');
    const secs = (secondsSpent % 60).toString().padStart(2, '0');
    document.getElementById('timer-display').innerText = `${mins}:${secs}`;
}, 1000);

// --- 2. AGORA VIDEO/AUDIO LOGIC ---
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

function adjustGrid() {
    const count = videoGrid.children.length - (localPlayerWrapper.style.display === 'none' ? 1 : 0);
    if (count === 1) videoGrid.style.gridTemplateColumns = "minmax(300px, 800px)";
    else if (count <= 4) videoGrid.style.gridTemplateColumns = "repeat(2, minmax(300px, 1fr))";
    else videoGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(300px, 1fr))";
}

async function ensureMedia() {
    if (localVideoTrack && localAudioTrack) return true;
    try {
        // Create local tracks
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localVideoTrack = await AgoraRTC.createCameraVideoTrack();
        
        // Setup Preview
        localPlayerWrapper.style.display = "flex";
        localVideoTrack.play("local-player");
        
        // Default to off so user can adjust before joining
        localAudioTrack.setEnabled(false);
        localVideoTrack.setEnabled(false);
        
        btnJoin.style.display = 'flex';
        adjustGrid();
        return true;
    } catch (error) {
        alert("Camera/Microphone access denied or not found.");
        console.error(error);
        return false;
    }
}

// Media Buttons
btnMic.onclick = async () => {
    if (isPublicRoom) return alert("🔇 Microphones are disabled in Public Rooms.");
    if (!(await ensureMedia())) return;
    isMicOn = !isMicOn;
    localAudioTrack.setEnabled(isMicOn);
    btnMic.className = isMicOn ? "btn-media btn-on" : "btn-media btn-off";
    btnMic.innerHTML = isMicOn ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
};

btnCam.onclick = async () => {
    if (!(await ensureMedia())) return;
    isCamOn = !isCamOn;
    localVideoTrack.setEnabled(isCamOn);
    btnCam.className = isCamOn ? "btn-media btn-on" : "btn-media btn-off";
    btnCam.innerHTML = isCamOn ? '<i class="fa-solid fa-video"></i>' : '<i class="fa-solid fa-video-slash"></i>';
};

// Handle remote users connecting
client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    
    if (mediaType === "video") {
        let playerWrapper = document.getElementById(`user-${user.uid}`);
        if (!playerWrapper) {
            playerWrapper = document.createElement("div");
            playerWrapper.id = `user-${user.uid}`;
            playerWrapper.className = "video-container";
            playerWrapper.innerHTML = `
                <div id="video-${user.uid}" style="width: 100%; height: 100%;"></div>
                <div class="name-badge">Student ${user.uid.toString().slice(-4)}</div>
            `;
            videoGrid.append(playerWrapper);
            adjustGrid();
        }
        user.videoTrack.play(`video-${user.uid}`);
    }
    
    if (mediaType === "audio") {
        user.audioTrack.play();
    }
});

client.on("user-unpublished", (user) => {
    const playerWrapper = document.getElementById(`user-${user.uid}`);
    if (playerWrapper) {
        playerWrapper.remove();
        adjustGrid();
    }
});

// The Join Trigger
btnJoin.onclick = async () => {
    if (isJoined) return;
    btnJoin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Joining...';
    btnJoin.disabled = true;

    try {
        // UID is generated automatically by Agora if we pass null
        const uid = await client.join(APP_ID, ROOM_ID, null, null);
        
        if (localAudioTrack && localVideoTrack) {
            await client.publish([localAudioTrack, localVideoTrack]);
        }
        
        isJoined = true;
        btnJoin.style.display = 'none';
        localPlayerWrapper.querySelector('.name-badge').innerText = "You";
    } catch (error) {
        alert("Failed to connect: " + (error.message || JSON.stringify(error)||error));
        console.error("Agora Error:", error);
        btnJoin.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Join Room';
        btnJoin.disabled = false;
    }
};

// --- 3. FIREBASE CHAT LOGIC ---
const chatPanel = document.getElementById('chat-panel');
const btnToggleChat = document.getElementById('btn-chat');
const btnCloseChat = document.getElementById('close-chat');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const messagesContainer = document.getElementById('chat-messages');

// Toggle Chat UI
btnToggleChat.onclick = () => {
    chatPanel.style.display = chatPanel.style.display === 'none' ? 'flex' : 'none';
};
btnCloseChat.onclick = () => { chatPanel.style.display = 'none'; };

// Load and Send Messages
const messagesRef = collection(db, "rooms", ROOM_ID, "messages");

// Listen for new messages in real-time
onSnapshot(query(messagesRef, orderBy("timestamp", "asc")), (snapshot) => {
    messagesContainer.innerHTML = ''; 
    snapshot.forEach((doc) => {
        const msg = doc.data();
        const isMine = auth.currentUser && msg.uid === auth.currentUser.uid;
        
        const div = document.createElement('div');
        div.className = `message ${isMine ? 'mine' : 'theirs'}`;
        div.innerHTML = `
            <div class="msg-author">${msg.name}</div>
            <div class="msg-text">${msg.text}</div>
        `;
        messagesContainer.appendChild(div);
    });
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// Send Message
async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    chatInput.value = ''; // clear input immediately
    
    // Fallback name if not logged in
    const userName = (auth.currentUser && auth.currentUser.displayName) ? auth.currentUser.displayName : "Anonymous Scholar";
    const userId = (auth.currentUser) ? auth.currentUser.uid : "anon-" + Math.floor(Math.random() * 1000);

    try {
        await addDoc(messagesRef, {
            text: text,
            name: userName,
            uid: userId,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Error sending message: ", e);
    }
}

btnSend.onclick = sendMessage;
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// --- 4. XP TRACKING ---
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
};