import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup, sendEmailVerification, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyB57PcjYtWktsOGKFLQmWX-Nc6HtYeZxp8",
    authDomain: "studyspace-f6e22.firebaseapp.com",
    projectId: "studyspace-f6e22",
    storageBucket: "studyspace-f6e22.firebasestorage.app",
    messagingSenderId: "498741408880",
    appId: "1:498741408880:web:bd5fdea00d10e9329130b5",
    measurementId: "G-J1X8Y7KDQV"
};

const LAMBDA_URL = "https://nvq32ao6fel7xdvfcjhzatg5ja0reeqs.lambda-url.us-east-1.on.aws/";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider(); 

let isLoginMode = true;
let selectedAvatar = "https://api.dicebear.com/7.x/adventurer/svg?seed=Felix";

const form = document.getElementById('auth-form');
const nameGroup = document.getElementById('name-group');
const avatarSection = document.getElementById('avatar-section');
const submitBtn = document.getElementById('submit-btn');
const googleBtn = document.getElementById('google-login-btn');
const toggleText = document.getElementById('toggle-auth');
const errorMsg = document.getElementById('error-msg');

document.querySelectorAll('.avatar-option').forEach(img => {
    img.addEventListener('click', (e) => {
        document.querySelectorAll('.avatar-option').forEach(i => i.classList.remove('selected'));
        e.target.classList.add('selected');
        selectedAvatar = e.target.getAttribute('data-url');
    });
});

window.toggleMode = () => {
    isLoginMode = !isLoginMode;
    errorMsg.style.display = 'none';

    if (isLoginMode) {
        nameGroup.style.display = 'none';
        avatarSection.style.display = 'none';
        submitBtn.innerText = 'Log In';
        document.getElementById('auth-subtitle').innerText = 'Sign in to join study rooms';
        toggleText.innerHTML = `Don't have an account? <span onclick="toggleMode()">Sign up here</span>`;
    } else {
        nameGroup.style.display = 'block';
        avatarSection.style.display = 'block';
        submitBtn.innerText = 'Create Account';
        document.getElementById('auth-subtitle').innerText = 'Set up your student profile';
        toggleText.innerHTML = `Already have an account? <span onclick="toggleMode()">Log in here</span>`;
    }
};

async function syncUserToBackend(user, displayName) {
    try {
        await fetch(LAMBDA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'initUser', 
                uid: user.uid,
                name: displayName || user.displayName || "Student",
                email: user.email
            })
        });
    } catch (e) {
        console.error("Failed to sync user with AWS backend", e);
    }
}

function handleSuccessfulLogin() {
    const returnUrl = sessionStorage.getItem('returnUrl');
    if (returnUrl) {
        sessionStorage.removeItem('returnUrl');
        window.location.href = returnUrl;
    } else {
        window.location.href = "/";
    }
}

googleBtn.addEventListener('click', async () => {
    errorMsg.style.display = 'none';
    try {
        const result = await signInWithPopup(auth, provider);
        await syncUserToBackend(result.user);
        handleSuccessfulLogin();
    } catch (error) {
        errorMsg.style.display = 'block';
        errorMsg.innerText = "❌ Google login failed or was cancelled.";
    }
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('user-email').value.trim();
    const pass = document.getElementById('user-pass').value.trim();
    const name = document.getElementById('user-name').value.trim();

    errorMsg.style.display = 'none';
    submitBtn.innerText = "Processing...";
    submitBtn.disabled = true;

   try {
        if (isLoginMode) {
            const userCredential = await signInWithEmailAndPassword(auth, email, pass);
            if (!userCredential.user.emailVerified) {
                await signOut(auth); 
                throw new Error("Please verify your email address. Check your inbox!");
            }
            handleSuccessfulLogin();
        } else {
            if (pass.length < 6) throw new Error("Password must be at least 6 characters.");
            if (!name) throw new Error("Please enter a Display Name.");

            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(userCredential.user, {
                displayName: name,
                photoURL: selectedAvatar
            });

            await syncUserToBackend(userCredential.user, name);
            await sendEmailVerification(userCredential.user);
            await signOut(auth);

            submitBtn.disabled = false;
            submitBtn.innerText = 'Create Account';
            errorMsg.style.color = "var(--accent)"; 
            errorMsg.innerText = "✅ Account created! Please check your email inbox to verify your account before logging in.";
            errorMsg.style.display = 'block';
            return; 
        }
    } catch (error) {
        submitBtn.disabled = false;
        submitBtn.innerText = isLoginMode ? 'Log In' : 'Create Account';
        
        errorMsg.style.color = "var(--danger)"; 
        errorMsg.style.display = 'block';
        
        if (error.code === 'auth/email-already-in-use') errorMsg.innerText = "❌ Email is already registered.";
        else if (error.code === 'auth/invalid-credential') errorMsg.innerText = "❌ Invalid email or password.";
        else errorMsg.innerText = `❌ ${error.message}`;
    }
});