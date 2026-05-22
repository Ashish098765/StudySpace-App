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
const ROOM_ID = window.location.pathname.split('/').pop();
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

// --- 3. DISCORD GRID SCALING ---
function adjustGrid() {
    const count = videoGrid.children.length;
    if (count === 1) videoGrid.style.gridTemplateColumns = "minmax(300px, 800px)";
    else if (count === 2) videoGrid.style.gridTemplateColumns = "repeat(2, minmax(300px, 1fr))";
    else if (count <= 4) videoGrid.style.gridTemplateColumns = "repeat(2, minmax(300px, 1fr))";
    else videoGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(300px, 1fr))";
}

// --- 4. ZOOM SPEECH HIGHLIGHT ENGINE ---
function monitorSpeech(stream, wrapperElement) {
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
            if (average > 20) wrapperElement.classList.add('speaking');
            else wrapperElement.classList.remove('speaking');
        };
    } catch (e) { console.warn("Speech detection disabled for stream."); }
}

// --- 5. WEB-RTC & MEDIA LOGIC ---
const socket = io('/');
const myPeer = new Peer(undefined, { host: '/', port: '3001' }); 
const myVideo = document.createElement('video');
myVideo.muted = true; // Always mute yourself to avoid echo
const peers = {};

let myStream = null;
let isMicOn = false;
let isCamOn = false;
let isConnected = false;

// Universal Video Appender
function addVideoStream(video, stream, label = "Student") {
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => { video.play(); });

    const wrapper = document.createElement('div');
    wrapper.className = 'video-container';

    const badge = document.createElement('div');
    badge.className = 'name-badge';
    badge.innerText = label;

    wrapper.appendChild(video);
    wrapper.appendChild(badge);

    monitorSpeech(stream, wrapper); 
    videoGrid.append(wrapper);
    adjustGrid();

    return wrapper; // Return so we can remove it later when they leave
}

function updateButtonStates() {
    btnMic.className = isMicOn ? "btn-media btn-on" : "btn-media btn-off";
    btnMic.innerHTML = isMicOn ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
    
    btnCam.className = isCamOn ? "btn-media btn-on" : "btn-media btn-off";
    btnCam.innerHTML = isCamOn ? '<i class="fa-solid fa-video"></i>' : '<i class="fa-solid fa-video-slash"></i>';
}

// 5a. The Lobby Preview Trigger
async function ensureMedia() {
    if (myStream) return true;
    try {
        myStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        myStream.getAudioTracks()[0].enabled = false; // Start muted safely
        isMicOn = false;
        isCamOn = true;

        addVideoStream(myVideo, myStream, "You (Preview)");
        btnJoin.style.display = 'flex'; // Show Join Button
        updateButtonStates();
        return true;
    } catch(e) { alert("Media access denied."); return false; }
}

// Button Events
btnCam.addEventListener('click', async () => {
    if (!(await ensureMedia())) return;
    isCamOn = !isCamOn;
    myStream.getVideoTracks()[0].enabled = isCamOn;
    updateButtonStates();
});

btnMic.addEventListener('click', async () => {
    if (isPublicRoom) return alert("🔇 Microphones are disabled in Public Rooms to maintain a quiet study environment.");
    if (!(await ensureMedia())) return;
    isMicOn = !isMicOn;
    myStream.getAudioTracks()[0].enabled = isMicOn;
    updateButtonStates();
});

// The Actual Join Trigger
btnJoin.addEventListener('click', () => {
    if (isConnected) return;
    isConnected = true;
    stopKickTimer();
    
    // Remove "Preview" from badge
    const myBadge = myVideo.parentElement.querySelector('.name-badge');
    if (myBadge) myBadge.innerText = "You";
    
    btnJoin.style.display = 'none'; // Hide join button
    socket.emit('join-room', ROOM_ID, myPeer.id);
});

btnScreen.addEventListener('click', async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        if (!isConnected) {
            myStream = screenStream;
            addVideoStream(myVideo, myStream, "You (Screen)");
            isConnected = true;
            stopKickTimer();
            socket.emit('join-room', ROOM_ID, myPeer.id);
        } else {
            const videoTrack = screenStream.getVideoTracks()[0];
            const sender = myPeer.getConnection().peerConnection?.getSenders().find(s => s.track.kind === videoTrack.kind);
            if (sender) sender.replaceTrack(videoTrack);
            myVideo.srcObject = screenStream;
        }
        btnScreen.className = "btn-media btn-on";
        screenStream.getVideoTracks()[0].onended = () => { alert("Screen sharing stopped."); window.location.reload(); };
    } catch (e) { console.error(e); }
});

// --- 6. PEER TO PEER LOGIC ---
myPeer.on('call', call => {
    if (!myStream) return;
    call.answer(myStream);
    const video = document.createElement('video');
    let peerWrapper;
    call.on('stream', userVideoStream => {
        if (!peerWrapper) peerWrapper = addVideoStream(video, userVideoStream, "Student");
    });
});

socket.on('user-connected', userId => {
    if (!myStream) return;
    const call = myPeer.call(userId, myStream);
    const video = document.createElement('video');
    let peerWrapper;
    
    call.on('stream', userVideoStream => {
        if (!peerWrapper) peerWrapper = addVideoStream(video, userVideoStream, "Student");
    });
    call.on('close', () => {
        if (peerWrapper) { peerWrapper.remove(); adjustGrid(); }
    });
    peers[userId] = call;
});

socket.on('user-disconnected', userId => {
    if (peers[userId]) peers[userId].close();
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
};