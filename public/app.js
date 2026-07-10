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

// Function to fetch and display the questions from Supabase
// 1. Helper function to format slugs into Title Case
// Helper: Formats "vector-algebra" into "Vector Algebra"
function formatTitle(slug) {
    if (!slug) return "General";
    return slug.split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Global variable to hold our fetched data temporarily
let examDataCache = {}; 

// This function is triggered from your HTML Gateway buttons
window.navigateToExplorer = async function(examName) {
    // 1. Switch screens (assuming you have a function to hide/show divs)
    document.getElementById('exam-gateway-screen').style.display = 'none';
    document.getElementById('chapter-explorer-screen').style.display = 'block';
    document.getElementById('explorer-title').textContent = `${examName} Workspace`;

    const sidebar = document.getElementById('subject-sidebar-container');
    const chapterList = document.getElementById('chapter-list-container');
    
    sidebar.innerHTML = '<p>Loading subjects...</p>';
    chapterList.innerHTML = '';

    try {
        // 2. Fetch data from Supabase 
        // Note: adjust the .eq() if your exam strings in the DB differ from 'JEE Mains'
        const { data, error } = await supabase
            .from('questions')
            .select('subject, chapter')
            .eq('exam', 'JEE Main'); // Assuming 'JEE Main' is how it's saved in your DB

        if (error) throw error;

        // 3. Group and remove duplicates
        examDataCache = {};
        data.forEach(row => {
            const subjName = formatTitle(row.subject);
            const chapSlug = row.chapter;
            const chapTitle = formatTitle(row.chapter);

            if (!examDataCache[subjName]) {
                examDataCache[subjName] = new Map();
            }
            examDataCache[subjName].set(chapSlug, chapTitle);
        });

        // 4. Render the Sidebar (Subjects)
        sidebar.innerHTML = '';
        const subjects = Object.keys(examDataCache).sort();

        subjects.forEach((subj, index) => {
            const btn = document.createElement('button');
            btn.className = 'sidebar-subject-btn';
            btn.textContent = subj;
            
            btn.onclick = () => {
                // Highlight active button
                document.querySelectorAll('.sidebar-subject-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Render the chapters for this subject
                renderChapters(subj, examDataCache[subj]);
            };
            sidebar.appendChild(btn);

            // Auto-click the first subject to populate the right panel immediately
            if (index === 0) btn.click();
        });

    } catch (err) {
        console.error("Fetch Error:", err);
        sidebar.innerHTML = '<p>Failed to load data.</p>';
    }
};

// Function to render chapters in the right-hand pane
function renderChapters(subjectName, chapterMap) {
    const container = document.getElementById('chapter-list-container');
    container.innerHTML = `<h2 style="margin-bottom: 20px; color: var(--text-dark);">${subjectName} Chapters</h2>`;
    
    const grid = document.createElement('div');
    grid.className = 'chapter-grid';

    // Sort chapters alphabetically
    const sortedChapters = Array.from(chapterMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));

    sortedChapters.forEach(([slug, title]) => {
        const card = document.createElement('div');
        card.className = 'chapter-card';
        card.innerHTML = `
            <h3>${title}</h3>
            <div style="margin-top: 15px; font-weight: 600; color: var(--primary-color); font-size: 0.9rem;">
                Practice Now <i class="fa-solid fa-arrow-right"></i>
            </div>
        `;
        
        card.onclick = () => {
            // When user clicks a chapter, trigger your next screen!
            console.log(`Starting practice for ${title} (${slug})`);
            // Example:
            // document.getElementById('chapter-explorer-screen').style.display = 'none';
            // document.getElementById('list-index-screen').style.display = 'block';
            // loadQuestionsForChapter(slug);
        };
        
        grid.appendChild(card);
    });

    container.appendChild(grid);
}