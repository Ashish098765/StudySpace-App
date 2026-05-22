const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

// Tell the server where to find your HTML and JS files
app.use(express.static('public')); 

// 1. Route: The Homepage
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// 2. Route: The Dynamic Study Rooms (THIS FIXES YOUR BUTTON!)
app.get('/room/:room', (req, res) => {
    res.sendFile(__dirname + '/public/room.html');
});

// 3. Socket.io Logic: Handling video and chat connections
io.on('connection', socket => {
    socket.on('join-room', (roomId, userId) => {
        // Connect the user to the specific room
        socket.join(roomId);
        
        // Tell everyone else in the room that a new user joined
        socket.to(roomId).emit('user-connected', userId);

        // Listen for chat messages and broadcast them to the room
        socket.on('chatMessage', message => {
            io.to(roomId).emit('message', { id: userId, text: message });
        });

        // When a user closes the tab, tell the room to remove their video
        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
});

// Start the server
server.listen(3000, () => {
    console.log("🚀 StudySpace Server running on port 3000");
});