/* global io, Peer */

const socket = io();
const videoGrid = document.getElementById('video-grid');
const myPeer = new Peer();
const peers = {};

// 1. Get the Room ID dynamically from the URL (e.g., removes the "/" from "/math101")
const currentRoom = window.location.pathname.replace('/', '');
let myUserId = '';
let localStream = null;

const myVideo = document.createElement('video');
myVideo.muted = true; // Always mute your own speaker

// 2. Start Video and Join Room automatically
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
    localStream = stream;
    addVideoStream(myVideo, stream);

    myPeer.on('call', call => {
        call.answer(stream);
        const video = document.createElement('video');
        call.on('stream', userVideoStream => {
            addVideoStream(video, userVideoStream);
        });
    });

    myPeer.on('open', id => {
        myUserId = id;
        socket.emit('join-room', currentRoom, myUserId);
    });
});

socket.on('user-connected', userId => {
    connectToNewUser(userId, localStream);
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
    call.on('close', () => { video.remove(); });
    peers[userId] = call;
}

function addVideoStream(video, stream) {
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => { video.play(); });
    videoGrid.append(video);
}

// --- 3. UI Toolbar Logic ---

// Copy Invite Link
document.getElementById('copy-btn').addEventListener('click', (e) => {
    navigator.clipboard.writeText(window.location.href);
    e.target.innerText = "✅ Link Copied!";
    setTimeout(() => { e.target.innerText = "📋 Copy Invite Link"; }, 2000);
});

// Toggle Mute
document.getElementById('mute-btn').addEventListener('click', (e) => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    e.target.innerText = audioTrack.enabled ? "🎤 Mute" : "🔇 Unmute";
    e.target.classList.toggle('off');
});

// Toggle Camera
document.getElementById('camera-btn').addEventListener('click', (e) => {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    e.target.innerText = videoTrack.enabled ? "📷 Stop Video" : "📹 Start Video";
    e.target.classList.toggle('off');
});

// --- 4. Chat Logic ---
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatWindow = document.getElementById('chat-window');

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (chatInput.value.trim()) {
        socket.emit('chatMessage', chatInput.value.trim());
        chatInput.value = '';
    }
});

socket.on('message', (data) => {
    const isMe = data.id === myUserId;
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    if (isMe) msgDiv.classList.add('me');
    
    // Create label if it's someone else
    const label = isMe ? "" : `<div style="font-size: 10px; color: #aaa; margin-bottom: 2px;">User_${data.id.substring(0,4)}</div>`;
    msgDiv.innerHTML = `${label}${data.text}`;
    
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
});