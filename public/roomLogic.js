import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, updateDoc, setDoc, getDoc, increment, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// --- AGORA CONFIGURATION ---
// ⚠️ PASTE YOUR AGORA TESTING APP ID HERE:
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

// --- 1. GLOBAL VARIABLES & UI SETUP ---
const urlParams = new URLSearchParams(window.location.search);
const ROOM_ID = urlParams.get('id') || 'public-general';

const lobbyScreen = document.getElementById('lobby-screen');
const videoGrid = document.getElementById('video-grid');
const localPlayerWrapper = document.getElementById('local-player-wrapper');
const btnJoin = document.getElementById('btn-join');

let localAudioTrack = null;
let localVideoTrack = null;
let isMicOn = false;
let isCamOn = false;
let isJoined = false;
let myAgoraUid = null;
let currentUserData = { name: "Guest Student", avatar: "https://www.gravatar.com/avatar/?d=mp" };

// Room Title Logic
const publicRooms = {
    'public-general': '📚 General Study Lounge',
    'public-pomodoro': '🍅 Pomodoro Focus',
    'public-quiet': '🤫 Quiet Reading Room'
};
const isPublicRoom = ROOM_ID.startsWith('public-');
document.getElementById('room-id-display').innerHTML = publicRooms[ROOM_ID] || `<i class="fa-solid fa-lock"></i> Room Code: <span style="color: var(--primary); letter-spacing: 2px;">${ROOM_ID}</span>`;

// Timer Logic
let secondsSpent = 0;
setInterval(() => {
    secondsSpent++;
    const mins = Math.floor(secondsSpent / 60).toString().padStart(2, '0');
    const secs = (secondsSpent % 60).toString().padStart(2, '0');
    document.getElementById('timer-display').innerText = `${mins}:${secs}`;
}, 1000);


// --- 2. AUTH & LOBBY LOGIC ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserData.name = user.displayName || "Student";
        currentUserData.avatar = user.photoURL || currentUserData.avatar;
    }
    
    // Populate Lobby Profile
    document.getElementById('lobby-name').innerText = currentUserData.name;
    document.getElementById('lobby-avatar').src = currentUserData.avatar;
    
    // Pre-populate Local Badge for Main Room
    document.getElementById('local-badge-name').innerText = currentUserData.name;
    document.getElementById('local-badge-avatar').src = currentUserData.avatar;

    // Initialize Camera for Lobby Preview
    await setupLobbyPreview();
});

async function setupLobbyPreview() {
    try {
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localVideoTrack = await AgoraRTC.createCameraVideoTrack();
        
        // Play video in the lobby box first
        localVideoTrack.play("lobby-video-preview");
        
        // Mute tracks by default
        await localAudioTrack.setMuted(true);
        await localVideoTrack.setMuted(true);
    } catch (error) {
        console.error("Camera access denied.", error);
    }
}


// --- 3. AGORA VIDEO LOGIC ---
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

function adjustGrid() {
    const count = videoGrid.children.length - (localPlayerWrapper.style.display === 'none' ? 1 : 0);
    if (count === 1) videoGrid.style.gridTemplateColumns = "minmax(300px, 800px)";
    else if (count <= 4) videoGrid.style.gridTemplateColumns = "repeat(2, minmax(300px, 1fr))";
    else videoGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(300px, 1fr))";
}

// Enable Speaker Highlight Feature
client.enableAudioVolumeIndicator();
client.on("volume-indicator", volumes => {
    volumes.forEach((volume) => {
        // Highlighting threshold (adjustable)
        if (volume.level > 10) {
            const wrapperId = volume.uid === myAgoraUid ? 'local-player-wrapper' : `user-${volume.uid}`;
            const wrapper = document.getElementById(wrapperId);
            if(wrapper) wrapper.classList.add('speaking');
        } else {
            const wrapperId = volume.uid === myAgoraUid ? 'local-player-wrapper' : `user-${volume.uid}`;
            const wrapper = document.getElementById(wrapperId);
            if(wrapper) wrapper.classList.remove('speaking');
        }
    });
});

// Sync Buttons Logic (Updates both lobby and main room buttons)
async function toggleMic() {
    if (isPublicRoom) return alert("🔇 Microphones are disabled in Public Rooms.");
    if (!localAudioTrack) return;
    isMicOn = !isMicOn;
    await localAudioTrack.setMuted(!isMicOn);
    
    const uiClass = isMicOn ? "btn-media btn-on" : "btn-media btn-off";
    const uiIcon = isMicOn ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
    
    document.getElementById('lobby-btn-mic').className = uiClass;
    document.getElementById('lobby-btn-mic').innerHTML = uiIcon;
    document.getElementById('main-btn-mic').className = uiClass;
    document.getElementById('main-btn-mic').innerHTML = uiIcon;
}

async function toggleCam() {
    if (!localVideoTrack) return;
    isCamOn = !isCamOn;
    await localVideoTrack.setMuted(!isCamOn);
    
    const uiClass = isCamOn ? "btn-media btn-on" : "btn-media btn-off";
    const uiIcon = isCamOn ? '<i class="fa-solid fa-video"></i>' : '<i class="fa-solid fa-video-slash"></i>';
    
    document.getElementById('lobby-btn-cam').className = uiClass;
    document.getElementById('lobby-btn-cam').innerHTML = uiIcon;
    document.getElementById('main-btn-cam').className = uiClass;
    document.getElementById('main-btn-cam').innerHTML = uiIcon;
}

document.getElementById('lobby-btn-mic').onclick = toggleMic;
document.getElementById('main-btn-mic').onclick = toggleMic;
document.getElementById('lobby-btn-cam').onclick = toggleCam;
document.getElementById('main-btn-cam').onclick = toggleCam;


// Remote Users Logic
client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    
    if (mediaType === "video") {
        let playerWrapper = document.getElementById(`user-${user.uid}`);
        if (!playerWrapper) {
            // Fetch their real name and avatar from Firestore!
            let studentName = `Student ${user.uid.toString().slice(-4)}`;
            let studentAvatar = "https://www.gravatar.com/avatar/?d=mp";
            
            try {
                const userDoc = await getDoc(doc(db, "rooms", ROOM_ID, "participants", String(user.uid)));
                if (userDoc.exists()) {
                    studentName = userDoc.data().name;
                    studentAvatar = userDoc.data().avatar;
                }
            } catch(e) { console.warn("Could not fetch user profile", e); }

            playerWrapper = document.createElement("div");
            playerWrapper.id = `user-${user.uid}`;
            playerWrapper.className = "video-container";
            playerWrapper.innerHTML = `
                <div id="video-${user.uid}" style="width: 100%; height: 100%;"></div>
                <div class="name-badge">
                    <img class="badge-avatar" src="${studentAvatar}">
                    <span>${studentName}</span>
                </div>
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

// --- 4. JOINING THE ROOM ---
btnJoin.onclick = async () => {
    if (isJoined) return;
    btnJoin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Entering...';
    btnJoin.disabled = true;

    try {
        // Join Agora Call
        myAgoraUid = await client.join(APP_ID, ROOM_ID, null, null);
        
        // Write my UID mapping to Firestore so others can see my real name/avatar!
        await setDoc(doc(db, "rooms", ROOM_ID, "participants", String(myAgoraUid)), {
            name: currentUserData.name,
            avatar: currentUserData.avatar,
            timestamp: serverTimestamp()
        });

        if (localAudioTrack && localVideoTrack) {
            await client.publish([localAudioTrack, localVideoTrack]);
        }
        
        isJoined = true;
        
        // Hide Lobby, Show Main Grid
        lobbyScreen.style.display = 'none';
        localPlayerWrapper.style.display = 'flex';
        
        // Move local video playback from lobby box to main grid box
        localVideoTrack.stop();
        localVideoTrack.play("local-player");
        
        adjustGrid();
    } catch (error) {
        alert("Failed to connect: " + (error.message || error));
        btnJoin.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Join Room';
        btnJoin.disabled = false;
    }
};


// --- 5. FIREBASE CHAT LOGIC ---
const chatPanel = document.getElementById('chat-panel');
const btnToggleChat = document.getElementById('btn-chat');
const btnCloseChat = document.getElementById('close-chat');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const messagesContainer = document.getElementById('chat-messages');

btnToggleChat.onclick = () => {
    chatPanel.style.display = chatPanel.style.display === 'none' ? 'flex' : 'none';
    if(chatPanel.style.display === 'flex') {
        btnToggleChat.classList.replace('btn-off', 'btn-on');
    } else {
        btnToggleChat.classList.replace('btn-on', 'btn-off');
    }
};
btnCloseChat.onclick = () => { 
    chatPanel.style.display = 'none'; 
    btnToggleChat.classList.replace('btn-on', 'btn-off');
};

const messagesRef = collection(db, "rooms", ROOM_ID, "messages");

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
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    chatInput.value = ''; 
    const userId = (auth.currentUser) ? auth.currentUser.uid : "anon-" + Math.floor(Math.random() * 1000);

    try {
        await addDoc(messagesRef, {
            text: text,
            name: currentUserData.name,
            uid: userId,
            timestamp: serverTimestamp()
        });
    } catch (e) { console.error("Error sending message: ", e); }
}

btnSend.onclick = sendMessage;
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// --- 6. XP TRACKING ---
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