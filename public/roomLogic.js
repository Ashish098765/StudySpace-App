import { getFirestore, doc, updateDoc, setDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
const db = getFirestore();

/* global io, Peer */

const socket = io();
const videoGrid = document.getElementById('video-grid');
const myPeer = new Peer();
const peers = {};

// 1. Get the Name from Firebase (saved on login)
const myName = localStorage.getItem('studySpaceUserName');

// 🛑 THE BOUNCER: Check if they are logged in
if (!myName) {
    // Save the exact room they were trying to join so we can send them back later
    sessionStorage.setItem('returnUrl', window.location.href);
    window.location.href = '/login.html';
}

// ... the rest of your code (const style = document.createElement...) continues here

// 2. Inject CSS for the floating video nametags
const style = document.createElement('style');
style.innerHTML = `
    .video-wrapper { position: relative; display: inline-block; overflow: hidden; border-radius: 12px; background: #000; width: 100%; height: 100%; min-height: 250px; }
    .video-name-label {
        position: absolute; bottom: 10px; left: 10px;
        background: rgba(0,0,0,0.7); color: white;
        padding: 4px 10px; border-radius: 6px;
        font-size: 12px; font-weight: 600; font-family: 'Inter', sans-serif;
        z-index: 10; pointer-events: none;
    }
    .video-wrapper video { width: 100%; height: 100%; object-fit: cover; }
`;
document.head.appendChild(style);

// 3. Figure out what room we are in from the URL
const currentRoom = window.location.pathname.split('/').pop();
let myUserId = '';
let localStream = null;

const myVideo = document.createElement('video');
myVideo.muted = true; // Always mute yourself

// ================================================================
// JOIN THE ROOM IMMEDIATELY
// ================================================================
myPeer.on('open', id => {
    myUserId = id;
    socket.emit('join-room', currentRoom, myUserId);
});

// ================================================================
// ATTEMPT TO START CAMERA (Safely checks for HTTPS first)
// ================================================================
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    // If HTTPS is secure, start the camera normally
    const btnStartCam = document.getElementById('btn-start-cam');
const btnShareScreen = document.getElementById('btn-share-screen');
const activityWarning = document.getElementById('activity-warning');

let myStream = null;

// --- 1. THE 2-MINUTE KICK TIMER ---
// 120,000 milliseconds = 2 minutes
let inactivityTimer = setTimeout(() => {
    alert("You were removed from the room for inactivity. Study rooms require a camera or screen share!");
    window.location.href = '/'; // Kick them back to the homepage
}, 120000);

// Helper function to stop the timer when they follow the rules
function userDidBecomeActive() {
    clearTimeout(inactivityTimer);
    activityWarning.style.display = 'none'; // Hide the red warning banner
    btnStartCam.style.display = 'none';     // Hide the buttons so they can't click them twice
    btnShareScreen.style.display = 'none';
}


// --- 2. CAMERA LOGIC ---
btnStartCam.addEventListener('click', async () => {
    try {
        myStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        userDidBecomeActive(); // Stop the kick timer!
        
        addVideoStream(myVideo, myStream);
        
        // Now that we have a stream, tell Socket.io and PeerJS we are ready to connect
        socket.emit('join-room', ROOM_ID, myPeer.id);
        
        // Answer incoming calls
        myPeer.on('call', call => {
            call.answer(myStream);
            const video = document.createElement('video');
            call.on('stream', userVideoStream => {
                addVideoStream(video, userVideoStream);
            });
        });

    } catch (error) {
        console.error("Camera error:", error);
        alert("Could not access your camera.");
    }
});


// --- 3. SCREEN SHARE LOGIC ---
btnShareScreen.addEventListener('click', async () => {
    try {
        // getDisplayMedia is the built-in browser API for screen sharing
        myStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        userDidBecomeActive(); // Stop the kick timer!
        
        addVideoStream(myVideo, myStream);
        
        // Tell Socket.io and PeerJS we are ready to connect
        socket.emit('join-room', ROOM_ID, myPeer.id);
        
        // Answer incoming calls with the screen share stream
        myPeer.on('call', call => {
            call.answer(myStream);
            const video = document.createElement('video');
            call.on('stream', userVideoStream => {
                addVideoStream(video, userVideoStream);
            });
        });

        // Listen for when the user clicks "Stop Sharing" on the browser's built-in popup
        myStream.getVideoTracks()[0].onended = () => {
            alert("Screen sharing ended. You must refresh to share again.");
            window.location.href = '/'; // Kick them out if they stop sharing
        };

    } catch (error) {
        console.error("Screen share error:", error);
        alert("Could not share screen.");
    }
});
} else {
    // If HTTP, skip the camera entirely so the script doesn't crash!
    console.warn("Camera API disabled by browser because this is not an HTTPS site. Text chat only!");
}

// ================================================================
// SOCKET CONNECTION LOGIC
// ================================================================
socket.on('user-connected', userId => {
    if (localStream) {
        connectToNewUser(userId, localStream);
    }
});

socket.on('user-disconnected', userId => {
    if (peers[userId]) peers[userId].close();
});

function connectToNewUser(userId, stream) {
    const call = myPeer.call(userId, stream, { metadata: { name: myName } });
    const video = document.createElement('video');
    
    let videoWrapper;
    call.on('stream', userVideoStream => {
        if(!videoWrapper) videoWrapper = addVideoStream(video, userVideoStream, call.metadata ? call.metadata.name : 'Participant');
    });
    
    call.on('close', () => { if(videoWrapper) videoWrapper.remove(); });
    peers[userId] = call;
}

function addVideoStream(video, stream, userName = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper';
    
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => { video.play(); });
    wrapper.append(video);

    if (userName) {
        const label = document.createElement('div');
        label.className = 'video-name-label';
        label.innerText = userName;
        wrapper.append(label);
    }

    videoGrid.append(wrapper);
    return wrapper; 
}

// ================================================================
// BUTTON LOGIC (Icons & Invite Links)
// ================================================================
document.getElementById('copy-btn').addEventListener('click', (e) => {
    const fullRoomUrl = window.location.href; 
    navigator.clipboard.writeText(fullRoomUrl);
    
    const btn = e.currentTarget;
    const textSpan = document.getElementById('invite-text');
    const originalText = textSpan.innerText;
    
    textSpan.innerText = "✅ Link Copied!";
    btn.style.background = "#10b981"; 
    
    setTimeout(() => { 
        textSpan.innerText = originalText; 
        btn.style.background = ""; 
    }, 2000);
});

document.getElementById('mute-btn').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('off'); 
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
        }
    }
});

document.getElementById('camera-btn').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('off');
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
        }
    }
});

// ================================================================
// LIVE CHAT LOGIC
// ================================================================
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatWindow = document.getElementById('chat-window');

function attemptSendMessage() {
    const text = chatInput.value.trim();
    if (text !== "") {
        const payload = JSON.stringify({ name: myName, text: text });
        socket.emit('chatMessage', payload);
        chatInput.value = ''; 
    }
}

if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault(); 
        attemptSendMessage();
    });
}

if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            attemptSendMessage();
        }
    });
}

socket.on('message', (data) => {
    const isMe = data.id === myUserId;
    let senderName = `User`;
    let messageText = data.text;
    
    try {
        const parsed = JSON.parse(data.text);
        senderName = parsed.name || "User";
        messageText = parsed.text;
    } catch(e) {} 

    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    if (isMe) msgDiv.classList.add('me');
    
    const label = isMe ? "" : `<div style="font-size: 11px; font-weight: 600; color: #6366f1; margin-bottom: 4px;">${senderName}</div>`;
    msgDiv.innerHTML = `${label}${messageText}`;
    
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
});