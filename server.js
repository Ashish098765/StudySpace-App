/* eslint-env node */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public'))); 

// ==========================================
//          HTTP ROUTING (WEB PAGES)
// ==========================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/practice', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'practice.html'));
});

app.get('/create-room', (req, res) => {
    const randomRoomId = Math.random().toString(36).substring(2, 9);
    res.redirect(`/${randomRoomId}`);
});

app.get('/materials', (req, res) => {
    res.send('<h2 style="font-family:sans-serif; text-align:center; margin-top:50px; color:#ffffff; background:#121212; height:100vh; padding-top:50px;">Study Materials Section Coming Soon!</h2>');
});

app.get('/tracker', (req, res) => {
    res.send('<h2 style="font-family:sans-serif; text-align:center; margin-top:50px; color:#ffffff; background:#121212; height:100vh; padding-top:50px;">Goal Tracker Coming Soon!</h2>');
});

app.get('/leaderboard', (req, res) => {
    res.send('<h2 style="font-family:sans-serif; text-align:center; margin-top:50px; color:#ffffff; background:#121212; height:100vh; padding-top:50px;">XP Leaderboard Coming Soon!</h2>');
});

app.get('/login', (req, res) => {
    res.send('<h2 style="font-family:sans-serif; text-align:center; margin-top:50px; color:#ffffff; background:#121212; height:100vh; padding-top:50px;">Authentication System Coming Soon!</h2>');
});

// ==========================================
//             BACKEND PYQ APIs
// ==========================================

app.get('/api/questions', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'data', 'questions.json');
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Questions database file not found." });
        
        const rawData = fs.readFileSync(filePath, 'utf8');
        const questions = JSON.parse(rawData);
        
        const clientQuestions = questions.map(q => ({
            id: q.id, exam: q.exam, year: q.year, subject: q.subject, chapter: q.chapter, text: q.text, options: q.options
        }));
        
        res.json(clientQuestions);
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: "Internal server error reading quiz data." });
    }
});

app.post('/api/check-answer', (req, res) => {
    try {
        const { questionId, selectedIndex } = req.body;
        const filePath = path.join(__dirname, 'data', 'questions.json');
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Questions database not found." });

        const rawData = fs.readFileSync(filePath, 'utf8');
        const questions = JSON.parse(rawData);
        const question = questions.find(q => q.id === questionId);

        if (question) {
            const isCorrect = question.correctAnswerIndex === selectedIndex;
            res.json({ isCorrect, correctIndex: question.correctAnswerIndex, explanation: question.explanation });
        } else {
            res.status(404).json({ error: "Specific question index not found." });
        }
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: "Internal server error processing answer check." });
    }
});

app.get('/:room', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// ==========================================
//     NEW: SOCKET.IO WAITING ROOM LOGIC
// ==========================================

// The Server's "Memory"
const roomOwners = {};  // Remembers who created which room
const lockedRooms = {}; // Remembers if a room is locked (true/false)

io.on('connection', (socket) => {
    console.log(`Connection established: Socket ID ${socket.id}`);

    // 1. A student clicks "Ask to Join" on the frontend
    socket.on('request-join', ({ roomId, username }) => {
        
        // Scenario A: The room is completely empty (This user is the first!)
        if (!roomOwners[roomId]) {
            roomOwners[roomId] = socket.id; // Assign them as the Owner
            lockedRooms[roomId] = false;    // Rooms start open by default
            
            socket.join(roomId);
            socket.emit('join-approved', { isOwner: true }); // Tell frontend they are the boss
            return;
        }

        // Scenario B: The room has an owner, and the door is LOCKED
        if (lockedRooms[roomId]) {
            const ownerSocketId = roomOwners[roomId];
            // Send a "knock" directly to the owner's screen
            io.to(ownerSocketId).emit('guest-knocking', {
                socketId: socket.id,
                username: username
            });
        } 
        // Scenario C: The room has an owner, but the door is PUBLIC
        else {
            socket.join(roomId);
            socket.emit('join-approved', { isOwner: false });
            socket.to(roomId).emit('user-connected', username); // Announce arrival
        }
    });

    // 2. The Owner clicks "Lock" or "Unlock"
    socket.on('update-lock-status', ({ roomId, locked }) => {
        // Security check: Make sure the person trying to lock it is actually the owner
        if (roomOwners[roomId] === socket.id) {
            lockedRooms[roomId] = locked;
        }
    });

    // 3. The Owner clicks "Let In" or "Deny" on the popup
    socket.on('owner-decision', ({ guestSocketId, approved }) => {
        if (approved) {
            // Find which room this owner is controlling
            const roomId = Object.keys(roomOwners).find(key => roomOwners[key] === socket.id);
            if (roomId) {
                // Force the waiting guest's socket into the room
                const guestSocket = io.sockets.sockets.get(guestSocketId);
                if (guestSocket) {
                    guestSocket.join(roomId);
                    io.to(guestSocketId).emit('join-approved', { isOwner: false });
                }
            }
        } else {
            // Send the rejection message
            io.to(guestSocketId).emit('join-denied');
        }
    });

    // 4. Cleanup when someone closes their tab
    socket.on('disconnect', () => {
        // If the owner leaves, we delete the room from memory so someone else can claim it later
        const ownedRoom = Object.keys(roomOwners).find(key => roomOwners[key] === socket.id);
        if (ownedRoom) {
            delete roomOwners[ownedRoom];
            delete lockedRooms[ownedRoom];
        }
    });
});

// ==========================================
//              SERVER START
// ==========================================
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log("=========================================");
    console.log("StudySpace Platform Successfully Deployed!");
    console.log("Local server running on port: " + PORT);
    console.log("=========================================");
});