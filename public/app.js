// ... top of your file (requires, express, io setup) ...

// Existing Home Route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// NEW: Dynamic Room Route
app.get('/room/:room', (req, res) => {
    // When someone goes to /room/anything, serve them the room interface
    res.sendFile(__dirname + '/public/room.html');
});

// ... your socket.io connection logic down below ...
/* global io, Peer */

const socket = io();
const videoGrid = document.getElementById('video-grid');
const myPeer = new Peer();
const peers = {};

// Get the Name from Firebase (saved on the homepage)
const myName = localStorage.getItem('studySpaceUserName') || 'Anonymous Student';

// Inject CSS for the floating video nametags
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

const currentRoom = window.location.pathname.replace('/', '');
let myUserId = '';
let localStream = null;

const myVideo = document.createElement('video');
myVideo.muted = true; 

// Start Video
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

// Send our Google Name through the WebRTC connection metadata!
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

// Wraps the video element to allow floating name tags
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

// --- Toolbar Logic ---
document.getElementById('copy-btn').addEventListener('click', (e) => {
    navigator.clipboard.writeText(window.location.href);
    e.target.innerText = "✅ Link Copied!";
    setTimeout(() => { e.target.innerText = "📋 Copy Invite Link"; }, 2000);
});

document.getElementById('mute-btn').addEventListener('click', (e) => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    e.target.innerText = audioTrack.enabled ? "🎤 Mute" : "🔇 Unmute";
    e.target.classList.toggle('off');
});

document.getElementById('camera-btn').addEventListener('click', (e) => {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    e.target.innerText = videoTrack.enabled ? "📷 Stop Video" : "📹 Start Video";
    e.target.classList.toggle('off');
});

// --- Chat Logic with Names ---
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatWindow = document.getElementById('chat-window');

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (chatInput.value.trim()) {
        // We pack the name and text together so the backend doesn't break
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
    } catch(e) { } // Fallback for old messages

    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    if (isMe) msgDiv.classList.add('me');
    
    const label = isMe ? "" : `<div style="font-size: 11px; font-weight: 600; color: #6366f1; margin-bottom: 3px;">${senderName}</div>`;
    msgDiv.innerHTML = `${label}${messageText}`;
    
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
});
// Function to fetch and display the questions
function loadQuestions() {
    // 1. Point to your newly created JSON file
    const dataUrl = 'data/questions/jee_phy_units.json'; 

    fetch(dataUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }
            return response.json();
        })
        .then(data => {
            console.log("Successfully loaded data:", data);
            
            // 2. We will write the code to display them here next!
            // For now, let's just make sure it loads in the background.
        })
        .catch(error => {
            console.error("Error loading the JSON file:", error);
        });
}

// 3. Call the function as soon as the page loads
document.addEventListener('DOMContentLoaded', loadQuestions);