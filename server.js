/* eslint-env node */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. Serve static files (CSS, JS, images)
app.use(express.static('public'));

// 2. Redirect to a random, unique room URL
app.get('/create-room', (req, res) => {
    // Generates a random 7-character string (e.g., /abc123x)
    const randomRoomId = Math.random().toString(36).substring(2, 9);
    res.redirect(`/${randomRoomId}`);
});

// 3. Dynamic Route: Serve the actual study room
app.get('/:room', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// 4. Socket.io Logic
io.on('connection', (socket) => {
    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        socket.to(roomId).emit('user-connected', userId);

        socket.on('chatMessage', (msg) => {
            io.to(roomId).emit('message', { id: userId, text: msg });
        });

        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Advanced Study Hub running on http://localhost:${PORT}`);
});