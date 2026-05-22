/* global io, Peer */

const socket = io();
const videoGrid = document.getElementById('video-grid');
const myPeer = new Peer();
const peers = {};

// 1. Get the Name from Firebase (saved on the homepage earlier!)
const myName = localStorage.getItem('studySpaceUserName') || 'Anonymous Student';

// 2. Inject CSS for the floating video nametags
const style = document.createElement('style');
style.innerHTML = `
    .video-wrapper { position: relative; display: inline-block; overflow: hidden; border-radius: 12px; background: #000; }
    .video-name-label {
        position: absolute; bottom: 10px; left: 10px;
        background: rgba(0,0,0,0.7); color: white;
        padding: 4px 10px; border-radius: 6px;
        font-size: 12px; font-weight: 600; font-family: 'Inter', sans-serif;
        z-index: 10; pointer-events: none;
    }
`;
document.head.appendChild(style);

// 3. Figure out what room we are in from the URL (e.g., /room/x8f9a2b)
const pathParts = window.location.pathname.split('/');
const currentRoom = pathParts[pathParts.length - 1]; 

let myUserId = '';
let localStream = null;

const myVideo = document.createElement('video');
myVideo.muted = true; // Always mute yourself so you don't hear an echo

// 4. Start Video & Audio
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
    localStream = stream;
    addVideoStream(myVideo, stream, myName + " (You)");

    // Answer incoming calls and read their name from the connection metadata
    myPeer.on('call', call => {
        call.answer(stream);
        const video = document.createElement('video');
        const callerName = (call.metadata && call.metadata.name) ? call.metadata.name : 'Participant';
        
        let videoWrapper;
        call.on('stream', userVideoStream => {
            if(!videoWrapper) videoWrapper = addVideoStream(video, userVideoStream, callerName);
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

// 5. Send our Google Name through the WebRTC connection metadata
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

// 6. Wrap the video element to attach the floating name tags
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

// --- 7. Toolbar Logic (Mute, Camera, Invite) ---
document.getElementById('copy-btn').addEventListener('click', (e) => {
    navigator.clipboard.writeText(window.location.href);
    e.target.innerText = "✅ Copied!";
    setTimeout(() => { e.target.innerText = "📋 Copy Invite Link"; }, 2000);
});

document.getElementById('mute-btn').addEventListener('click', (e) => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    e.target.innerText = audioTrack.enabled ? "🎤" : "🔇";
    e.target.classList.toggle('off');
});

document.getElementById('camera-btn').addEventListener('click', (e) => {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    e.target.innerText = videoTrack.enabled ? "📹" : "📷";
    e.target.classList.toggle('off');
});

// --- 8. Live Chat Logic with Google Names ---
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatWindow = document.getElementById('chat-window');

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (chatInput.value.trim()) {
        // Pack the name and text together so the backend knows who sent it
        const payload = JSON.stringify({ name: myName, text: chatInput.value.trim() });
        socket.emit('chatMessage', payload);
        chatInput.value = '';
    }
});

socket.on('message', (data) => {
    const isMe = data.id === myUserId;
    
    // Unpack the JSON to extract the real name and message
    let senderName = `User_${data.id.substring(0,4)}`;
    let messageText = data.text;
    try {
        const parsed = JSON.parse(data.text);
        senderName = parsed.name;
        messageText = parsed.text;
    } catch(e) { } 

    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    if (isMe) msgDiv.classList.add('me');
    
    // Make the name blue and small above the text message
    const label = isMe ? "" : `<div style="font-size: 11px; font-weight: 600; color: #6366f1; margin-bottom: 3px;">${senderName}</div>`;
    msgDiv.innerHTML = `${label}${messageText}`;
    
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
});