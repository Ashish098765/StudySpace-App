/* global io, Peer */

const socket = io();
const videoGrid = document.getElementById('video-grid');
const myPeer = new Peer();
const peers = {};

// 1. Get the Name from Firebase (saved on the homepage)
const myName = localStorage.getItem('studySpaceUserName') || 'Student';

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
// FIX: JOIN THE ROOM IMMEDIATELY (Don't wait for the camera!)
// ================================================================
myPeer.on('open', id => {
    myUserId = id;
    socket.emit('join-room', currentRoom, myUserId);
});

// ================================================================
// ATTEMPT TO START CAMERA (Will fail on HTTP, but won't break chat)
// ================================================================
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localStream = stream;
        addVideoStream(myVideo, stream, myName + " (You)");

        myPeer.on('call', call => {
            call.answer(stream);
            const video = document.createElement('video');
            const callerName = (call.metadata && call.metadata.name) ? call.metadata.name : 'Participant';
            
            let videoWrapper;
            call.on('stream', userVideoStream => {
                if(!videoWrapper) videoWrapper = addVideoStream(video, userVideoStream, callerName);
            });
        });
    })
    .catch(err => {
        console.warn("Camera blocked by browser (Needs HTTPS):", err);
        // We log the warning, but the rest of the app continues to work!
    });

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
// FIX: ADD SAFETY CHECKS TO BUTTONS
// ================================================================
// ================================================================
// BUTTON LOGIC (Icons & Invite Links)
// ================================================================

// Copy exact room URL to clipboard
document.getElementById('copy-btn').addEventListener('click', (e) => {
    const fullRoomUrl = window.location.href; // Grabs http://your-ip:3000/room/123
    navigator.clipboard.writeText(fullRoomUrl);
    
    // Give visual feedback
    const btn = e.currentTarget;
    const textSpan = document.getElementById('invite-text');
    const originalText = textSpan.innerText;
    
    textSpan.innerText = "✅ Link Copied!";
    btn.style.background = "#10b981"; // Turn button green temporarily
    
    setTimeout(() => { 
        textSpan.innerText = originalText; 
        btn.style.background = ""; // Reset to original color
    }, 2000);
});

// Toggle Microphone (Swaps SVGs automatically using CSS)
document.getElementById('mute-btn').addEventListener('click', (e) => {
    if (!localStream) return alert("Camera/mic is blocked (Needs HTTPS).");
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        // e.currentTarget gets the button itself, not the SVG path inside it
        e.currentTarget.classList.toggle('off'); 
    }
});

// Toggle Camera (Swaps SVGs automatically using CSS)
document.getElementById('camera-btn').addEventListener('click', (e) => {
    if (!localStream) return alert("Camera/mic is blocked (Needs HTTPS).");
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        e.currentTarget.classList.toggle('off');
    }
});

// ================================================================
// LIVE CHAT LOGIC
// ================================================================
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatWindow = document.getElementById('chat-window');

// Send Message
chatForm.addEventListener('submit', (e) => {
    e.preventDefault(); 
    const text = chatInput.value.trim();
    
    if (text !== "") {
        // Send our Google Name alongside the message
        const payload = JSON.stringify({ name: myName, text: text });
        socket.emit('chatMessage', payload);
        chatInput.value = ''; // Clear the input box
    }
});

// Receive Message
socket.on('message', (data) => {
    const isMe = data.id === myUserId;
    let senderName = `User`;
    let messageText = data.text;
    
    // Unpack the JSON payload sent by other users
    try {
        const parsed = JSON.parse(data.text);
        senderName = parsed.name || "User";
        messageText = parsed.text;
    } catch(e) {} 

    // Create the chat bubble
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    if (isMe) msgDiv.classList.add('me');
    
    // Add the user's name above the message (unless it's you)
    const label = isMe ? "" : `<div style="font-size: 11px; font-weight: 600; color: #6366f1; margin-bottom: 4px;">${senderName}</div>`;
    msgDiv.innerHTML = `${label}${messageText}`;
    
    // Inject into the chat window and auto-scroll to the bottom
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
});