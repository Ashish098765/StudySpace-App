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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Make auth global so your XP saver at the bottom can see who is logged in!
window.auth = auth; 

// --- YOUR EXISTING CODE CONTINUES HERE ---
// const ROOM_ID = window.location.pathname.split('/').pop();
// const roomTitleDisplay = document.getElementById('room-id-display');
// ... etc
// --- 1. UI SETUP & TIMER ---
const ROOM_ID = window.location.pathname.split('/').pop();
const roomTitleDisplay = document.getElementById('room-id-display');
const activityWarning = document.getElementById('activity-warning');
const timerDisplay = document.getElementById('timer-display');
const videoGrid = document.getElementById('video-grid');

const btnMic = document.getElementById('btn-mic');
const btnCam = document.getElementById('btn-cam');
const btnScreen = document.getElementById('btn-screen');

let secondsSpent = 0;
setInterval(() => {
    secondsSpent++;
    const mins = Math.floor(secondsSpent / 60).toString().padStart(2, '0');
    const secs = (secondsSpent % 60).toString().padStart(2, '0');
    if (timerDisplay) timerDisplay.innerText = `${mins}:${secs}`;
}, 1000);

// --- 2. ROOM RULES (2-Min Kick) ---
const publicRooms = {
    'public-general': '📚 General Study Lounge',
    'public-pomodoro': '🍅 Pomodoro Focus',
    'public-quiet': '🤫 Quiet Reading Room'
};
const isPublicRoom = ROOM_ID.startsWith('public-');

if (publicRooms[ROOM_ID]) roomTitleDisplay.innerHTML = publicRooms[ROOM_ID];
else roomTitleDisplay.innerHTML = `<i class="fa-solid fa-lock"></i> Private Room (${ROOM_ID})`;

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

// --- 3. WEB-RTC & MEDIA LOGIC ---
const socket = io('/');
const myPeer = new Peer(undefined, { host: '/', port: '3001' }); 
const myVideo = document.createElement('video');
myVideo.muted = true; // Always mute yourself to avoid echo
const peers = {};

let myStream = null;
let isMicOn = false;
let isCamOn = false;
let isConnected = false;

// Function to actually connect to the room (runs ONLY ONCE)
function connectToRoom(stream) {
    if (isConnected) return;
    isConnected = true;
    stopKickTimer();
    function addVideoStream(video, stream) {
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => { video.play(); });
    
    // START LISTENING TO THIS VIDEO FOR SPEECH HIGHLIGHTS
    monitorSpeech(stream, video); 
    
    videoGrid.append(video);
}
    addVideoStream(myVideo, stream);
    socket.emit('join-room', ROOM_ID, myPeer.id);
}

// --- MIC TOGGLE ---
// --- MIC TOGGLE ---
btnMic.addEventListener('click', async () => {
    // NEW: Force close mic in public rooms
    if (isPublicRoom) {
        alert("🔇 Microphones are disabled in Public Rooms to maintain a quiet study environment.");
        return; 
    }
    // If we don't have a stream yet, ask for it
    if (!myStream) {
        try {
            myStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            connectToRoom(myStream);
            isCamOn = true; // Got cam by default
        } catch (e) { alert("Microphone access denied."); return; }
    }
    
    // Toggle audio track state
    isMicOn = !isMicOn;
    myStream.getAudioTracks()[0].enabled = isMicOn;
    
    // Update Button UI
    if (isMicOn) {
        btnMic.className = "btn-media btn-on";
        btnMic.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    } else {
        btnMic.className = "btn-media btn-off";
        btnMic.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
    }

    // Sync Cam UI if it was just turned on for the first time
    if (isCamOn) {
        btnCam.className = "btn-media btn-on";
        btnCam.innerHTML = '<i class="fa-solid fa-video"></i>';
    }
});

// --- CAMERA TOGGLE ---
// --- CAMERA TOGGLE & PREVIEW ---
let isPreviewing = false;

btnCam.addEventListener('click', async () => {
    // 1. If they have no stream, get it and start PREVIEW MODE
    if (!myStream) {
        try {
            myStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            
            // Add video to screen, but DO NOT connect to the room yet
            addVideoStream(myVideo, myStream); 
            isCamOn = true;
            isPreviewing = true;
            
            // Change button to green "Join Call" button
            btnCam.className = "btn-media";
            btnCam.style.background = "var(--accent)";
            btnCam.style.width = "auto";
            btnCam.style.padding = "0 1.5rem";
            btnCam.style.borderRadius = "8px";
            btnCam.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Join Call';
            return; 
        } catch (e) { alert("Camera access denied."); return; }
    }
    
    // 2. If they are previewing and click "Join Call", officially connect!
    if (isPreviewing) {
        connectToRoom(myStream);
        isPreviewing = false;
        
        // Reset button back to standard Camera Toggle icon
        btnCam.style = ""; 
        btnCam.className = "btn-media btn-on";
        btnCam.innerHTML = '<i class="fa-solid fa-video"></i>';
        return;
    }

    // 3. Normal Toggle (On/Off) once they are in the room
    isCamOn = !isCamOn;
    myStream.getVideoTracks()[0].enabled = isCamOn;
    
    if (isCamOn) {
        btnCam.className = "btn-media btn-on";
        btnCam.innerHTML = '<i class="fa-solid fa-video"></i>';
    } else {
        btnCam.className = "btn-media btn-off";
        btnCam.innerHTML = '<i class="fa-solid fa-video-slash"></i>';
    }
});

// --- SCREEN SHARE LOGIC ---
btnScreen.addEventListener('click', async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        
        // If they hadn't connected yet, connect now with screen
        if (!isConnected) {
            myStream = screenStream;
            connectToRoom(myStream);
        } else {
            // Replace camera video track with screen video track for all peers
            const videoTrack = screenStream.getVideoTracks()[0];
            const sender = myPeer.getConnection().peerConnection.getSenders().find(s => s.track.kind === videoTrack.kind);
            sender.replaceTrack(videoTrack);
            myVideo.srcObject = screenStream;
        }

        btnScreen.className = "btn-media btn-on";
        stopKickTimer();

        // Listen for user hitting "Stop Sharing" on Chrome's built in popup
        screenStream.getVideoTracks()[0].onended = () => {
            alert("Screen sharing stopped.");
            window.location.reload(); 
        };
    } catch (error) {
        console.error(error);
    }
});

// --- PEER TO PEER LOGIC ---
myPeer.on('call', call => {
    if (!myStream) return;
    call.answer(myStream);
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream);
    });
});

socket.on('user-connected', userId => {
    if (myStream) connectToNewUser(userId, myStream);
});

socket.on('user-disconnected', userId => {
    if (peers[userId]) peers[userId].close();
});

function connectToNewUser(userId, stream) {
    const call = myPeer.call(userId, stream);
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream);
    });
    call.on('close', () => {
        video.remove();
    });
    peers[userId] = call;
}

function addVideoStream(video, stream) {
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => { video.play(); });
    videoGrid.append(video);
}

// --- XP SAVER (FIREBASE) ---
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
// --- SPEECH DETECTION ENGINE (ZOOM HIGHLIGHT) ---
function monitorSpeech(stream, videoElement) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);
        const scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1);

        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;

        microphone.connect(analyser);
        analyser.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);

        scriptProcessor.onaudioprocess = function() {
            const array = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(array);
            let values = 0;
            for (let i = 0; i < array.length; i++) values += (array[i]);
            
            const average = values / array.length;
            
            // If volume is above threshold (20), they are talking!
            if (average > 20) {
                videoElement.classList.add('speaking');
            } else {
                videoElement.classList.remove('speaking');
            }
        };
    } catch (e) {
        console.warn("Speech detection not supported for this stream.", e);
    }
}