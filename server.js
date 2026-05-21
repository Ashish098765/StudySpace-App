/* eslint-env node */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 1. Middleware configuration
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public'))); 

// ==========================================
//          HTTP ROUTING (WEB PAGES)
// ==========================================

// ROOT ROUTE: Opens your home page first
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// PRACTICE ROUTE: Opens your MARKS-style PYQ engine page
app.get('/practice', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'practice.html'));
});

// CREATE ROOM ROUTE: Generates a dynamic room ID and redirects
app.get('/create-room', (req, res) => {
    const randomRoomId = Math.random().toString(36).substring(2, 9);
    res.redirect(`/${randomRoomId}`);
});

// SUB-PAGES: Clean fallback text screens until you build their HTML files
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

// Fetch questions safely (excludes answers for security)
app.get('/api/questions', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'data', 'questions.json');
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Questions database file not found." });
        }
        
        const rawData = fs.readFileSync(filePath, 'utf8');
        const questions = JSON.parse(rawData);
        
        const clientQuestions = questions.map(q => ({
            id: q.id,
            exam: q.exam,
            year: q.year,
            subject: q.subject,
            chapter: q.chapter,
            text: q.text,
            options: q.options
        }));
        
        res.json(clientQuestions);
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: "Internal server error reading quiz data." });
    }
});

// Verify the answer submitted by a student
app.post('/api/check-answer', (req, res) => {
    try {
        const { questionId, selectedIndex } = req.body;
        const filePath = path.join(__dirname, 'data', 'questions.json');
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Questions database not found." });
        }

        const rawData = fs.readFileSync(filePath, 'utf8');
        const questions = JSON.parse(rawData);
        const question = questions.find(q => q.id === questionId);

        if (question) {
            const isCorrect = question.correctAnswerIndex === selectedIndex;
            res.json({
                isCorrect,
                correctIndex: question.correctAnswerIndex,
                explanation: question.explanation
            });
        } else {
            res.status(404).json({ error: "Specific question index not found." });
        }
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: "Internal server error processing answer check." });
    }
});


// ==========================================
//      DYNAMIC ROUTE (MUST BE AT THE BOTTOM)
// ==========================================

// Catch-all route for personalized study rooms (e.g. yoursite.com/xyz123)
app.get('/:room', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
});


// ==========================================
//        SOCKET.IO REAL-TIME CHAT & VIDEO
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log("=========================================");
    console.log("StudySpace Platform Successfully Deployed!");
    console.log("Local server running on port: " + PORT);
    console.log("=========================================");
});