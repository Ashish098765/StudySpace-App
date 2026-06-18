import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, updateDoc, setDoc, increment, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// --- AGORA CONFIGURATION ---
// ⚠️ PASTE YOUR AGORA TESTING APP ID HERE:
const APP_ID = "8a735e3d22a7475babf205eab01d8859"; 

// --- FIREBASE CONFIGURATION ---
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
    document.getElementById('lobby-main-avatar').src = currentUserData.avatar;
    
    // Pre-populate Local Badge for Main Room
    document.getElementById('local-badge-name').innerText = currentUserData.name;
    document.getElementById('local-badge-avatar').src = currentUserData.avatar;
    document.getElementById('local-main-avatar').src = currentUserData.avatar;

    // Initialize Camera for Lobby Preview
    await setupLobbyPreview();
});

async function setupLobbyPreview() {
    try {
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localVideoTrack = await AgoraRTC.createCameraVideoTrack();
        
        localVideoTrack.play("lobby-video-preview");
        
        // Start completely muted (camera off)
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
        const wrapperId = volume.uid === myAgoraUid ? 'local-player-wrapper' : `user-${volume.uid}`;
        const wrapper = document.getElementById(wrapperId);
        if(wrapper) {
            if (volume.level > 10) wrapper.classList.add('speaking');
            else wrapper.classList.remove('speaking');
        }
    });
});

// Sync Buttons & Push State to Firebase
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
    
    // Toggle the Discord Avatar overlays locally
    const lobbyPrev = document.getElementById('lobby-preview-container');
    if (isCamOn) {
        localPlayerWrapper.classList.remove('cam-off');
        lobbyPrev.classList.remove('cam-off');
    } else {
        localPlayerWrapper.classList.add('cam-off');
        lobbyPrev.classList.add('cam-off');
    }
    
    // Send new camera state to Firebase so others can see!
    if (isJoined && myAgoraUid) {
        try {
            await updateDoc(doc(db, "rooms", ROOM_ID, "participants", String(myAgoraUid)), { isCamOn: isCamOn });
        } catch(e) {}
    }
    
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


// --- 4. THE DISCORD METHOD (Firestore + Agora) ---

// Step A: Build the HTML Shell as soon as they enter (Even before tracks arrive)
client.on("user-joined", (user) => {
    let playerWrapper = document.getElementById(`user-${user.uid}`);
    if (!playerWrapper) {
        playerWrapper = document.createElement("div");
        playerWrapper.id = `user-${user.uid}`;
        playerWrapper.className = "video-container cam-off"; // Default to Avatar view
        playerWrapper.innerHTML = `
            <img id="main-avatar-${user.uid}" class="main-avatar" src="https://www.gravatar.com/avatar/?d=mp">
            <div id="video-${user.uid}" class="agora-video-view"></div>
            <div class="name-badge">
                <img id="badge-avatar-${user.uid}" class="badge-avatar" src="https://www.gravatar.com/avatar/?d=mp">
                <span id="name-${user.uid}">Connecting...</span>
            </div>
        `;
        videoGrid.append(playerWrapper);
        adjustGrid();
    }
});

// Step B: Inject the actual video track into the shell when it arrives
client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    if (mediaType === "video") {
        user.videoTrack.play(`video-${user.uid}`);
    }
    if (mediaType === "audio") {
        user.audioTrack.play();
    }
});

// Step C: Delete the shell when they leave
client.on("user-left", (user) => {
    const playerWrapper = document.getElementById(`user-${user.uid}`);
    if (playerWrapper) {
        playerWrapper.remove();
        adjustGrid();
    }
});

// Step D: Real-Time Firebase Listener to update Names, Avatars, and Camera states!
onSnapshot(collection(db, "rooms", ROOM_ID, "participants"), (snapshot) => {
    snapshot.forEach((docSnap) => {
        const uid = docSnap.id;
        if (uid === String(myAgoraUid)) return; // Ignore ourselves
        
        const data = docSnap.data();
        const wrapper = document.getElementById(`user-${uid}`);
        
        if (wrapper) {
            // Update names and images
            document.getElementById(`name-${uid}`).innerText = data.name || `Student`;
            document.getElementById(`main-avatar-${uid}`).src = data.avatar || 'https://www.gravatar.com/avatar/?d=mp';
            document.getElementById(`badge-avatar-${uid}`).src = data.avatar || 'https://www.gravatar.com/avatar/?d=mp';
            
            // Toggle the Discord Avatar overlay based on their remote camera state
            if (data.isCamOn) {
                wrapper.classList.remove('cam-off');
            } else {
                wrapper.classList.add('cam-off');
            }
        }
    });
});


// --- 5. JOINING THE ROOM ---
btnJoin.onclick = async () => {
    if (isJoined) return;
    btnJoin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Entering...';
    btnJoin.disabled = true;

    try {
        myAgoraUid = await client.join(APP_ID, ROOM_ID, null, null);
        
        // Announce myself to Firebase so everyone else sees my avatar!
        await setDoc(doc(db, "rooms", ROOM_ID, "participants", String(myAgoraUid)), {
            name: currentUserData.name,
            avatar: currentUserData.avatar,
            isCamOn: isCamOn,
            timestamp: serverTimestamp()
        });

        if (localAudioTrack && localVideoTrack) {
            await client.publish([localAudioTrack, localVideoTrack]);
        }
        
        isJoined = true;
        
        // Hide Lobby, Show Main Grid
        lobbyScreen.style.display = 'none';
        localPlayerWrapper.style.display = 'flex';
        
        // Move local video playback to the grid box
        localVideoTrack.stop();
        localVideoTrack.play("local-player");
        
        adjustGrid();
    } catch (error) {
        alert("Failed to connect: " + (error.message || error));
        btnJoin.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Join Room';
        btnJoin.disabled = false;
    }
};


// --- 6. FIREBASE CHAT LOGIC ---
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
    snapshot.forEach((docSnap) => {
        const msg = docSnap.data();
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

// --- 7. XP TRACKING ---
// FIXED: Switched to 'pagehide' and removed async to prevent the "Leave site?" popup
window.addEventListener('pagehide', () => {
    const user = window.auth?.currentUser;
    if (user && secondsSpent >= 60) {
        const xpEarned = Math.floor(secondsSpent / 60) * 10;
        const userRef = doc(db, "users", user.uid);
        
        // Fire and forget: We run this in the background without awaiting it
        updateDoc(userRef, { xp: increment(xpEarned), lastActive: new Date() }).catch(() => {
            setDoc(userRef, { name: user.displayName || 'Student', xp: xpEarned, lastActive: new Date() });
        });
    }
});