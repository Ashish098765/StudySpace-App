const LAMBDA_URL = "https://nvq32ao6fel7xdvfcjhzatg5ja0reeqs.lambda-url.us-east-1.on.aws/";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const firebaseConfig = {
    apiKey: "AIzaSyB57PcjYtWktsOGKFLQmWX-Nc6HtYeZxp8",
    authDomain: "studyspace-f6e22.firebaseapp.com",
    projectId: "studyspace-f6e22",
    storageBucket: "studyspace-f6e22.firebasestorage.app",
    messagingSenderId: "498741408880",
    appId: "1:498741408880:web:bd5fdea00d10e9329130b5",
    measurementId: "G-J1X8Y7KDQV"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const SUPABASE_URL = 'https://zejxcppxkcmvhhejface.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2t5l8g6rut0QvQ1GmCMsDg_VJha74oz';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let isAIGenerating = false; 
let aiAbortController = null; 

let correctIds = JSON.parse(localStorage.getItem('studySpace_correctIds')) || [];
let wrongIds = JSON.parse(localStorage.getItem('studySpace_wrongIds')) || [];

let selectedTargetExam = "";
let selectedActiveSubject = "";
let selectedActiveChapter = "";
let selectedChapterId = ""; 
let activeMetadata = null; 
let filteredPracticeSet = [];
let globalMetadata = []; 
let isDatabaseLoaded = false;
let databaseLoadPromise = null;

let currentFocusIndex = 0;
let selectedOptionIndex = null;
let isFocusAnswerChecked = false;

const screenGateway = document.getElementById('exam-gateway-screen');
const screenExplorer = document.getElementById('chapter-explorer-screen');
const screenList = document.getElementById('list-index-screen');
const screenFocus = document.getElementById('quiz-focus-screen');
const CLOUDINARY_BASE_URL = "https://res.cloudinary.com/dyxyzz9r9/image/upload/f_auto,q_auto/";

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        try {
            const token = await user.getIdToken();
            const response = await fetch(LAMBDA_URL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ action: 'getUserData', uid: user.uid })
            });
            
            if (response.ok) {
                const userData = await response.json();
                if (userData) {
                    const fbCorrect = userData.correctIds || [];
                    const fbWrong = userData.wrongIds || [];
                    
                    correctIds = [...new Set([...correctIds, ...fbCorrect])];
                    wrongIds = [...new Set([...wrongIds, ...fbWrong])];
                    
                    localStorage.setItem('studySpace_correctIds', JSON.stringify(correctIds));
                    localStorage.setItem('studySpace_wrongIds', JSON.stringify(wrongIds));
                    
                    if (document.getElementById('list-index-screen').style.display === 'block') {
                        renderIndexList();
                    }
                }
            }
        } catch (error) {
            console.error("Failed to load user data from Lambda:", error);
        }
    }
});

window.triggerMathRender = (elementId) => {
    const el = document.getElementById(elementId);
    if (el && window.MathJax) {
        MathJax.typesetPromise([el]).catch((err) => console.log('MathJax error: ', err));
    }
};

function injectInlineImages(text) {
    if (!text) return "";
    const imgRegex = /\[IMG:\s*([^\]]+)\]/g;
    return text.replace(imgRegex, (match, filename) => {
        const cleanFilename = filename.trim();
        if (cleanFilename === "requires_image.png" || cleanFilename === "null") {
            return `<div style="padding: 10px; border: 1px dashed var(--error-red); color: var(--error-red); font-size: 0.8rem; border-radius: 8px; display: inline-block; margin: 10px 0;">[Image missing in database]</div>`;
        }
        return `<img class="q-image" src="${CLOUDINARY_BASE_URL}${cleanFilename}" alt="Diagram">`;
    });
}

function formatGenericText(text) {
    if (text === null || text === undefined) return "";
    if (typeof text !== 'string') text = String(text);
    if (text.trim() === "N/A" || text.trim() === "") return "<div style='color: var(--text-tertiary); font-style: italic;'>No detailed explanation available for this question.</div>";
    
    let mathBlocks = [];
    let mathIndex = 0;
    text = text.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[\s\S]*?\$|\\\([\s\S]*?\\\))/g, (match) => {
        mathBlocks.push(match);
        return `___MATH_BLOCK_${mathIndex++}___`;
    });

    let formatted = markdownTableToHTML(text);
    formatted = formatted.replace(/^###\s+(.*$)/gim, '<h3 style="color: #818cf8; margin-top: 1.5rem; margin-bottom: 0.5rem; font-size: 1.1rem; text-transform: uppercase; letter-spacing: 0.5px;">$1</h3>');
    formatted = formatted.replace(/^##\s+(.*$)/gim, '<h2 style="color: var(--text-main); margin-top: 1.5rem; margin-bottom: 0.5rem; font-size: 1.25rem;">$1</h2>');
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong style="color: white; font-weight: 700;">$1</strong>');
    formatted = formatted.replace(/\n/g, '<br>');
    
    mathBlocks.forEach((block, idx) => {
        formatted = formatted.replace(`___MATH_BLOCK_${idx}___`, block);
    });
    return injectInlineImages(formatted); 
}

function formatQuestionBody(text) {
    if (text === null || text === undefined) return "";
    if (typeof text !== 'string') text = String(text);
    
    let mathBlocks = [];
    let mathIndex = 0;
    text = text.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[\s\S]*?\$|\\\([\s\S]*?\\\))/g, (match) => {
        mathBlocks.push(match);
        return `___MATH_BLOCK_${mathIndex++}___`;
    });

    let formatted = markdownTableToHTML(text);
    formatted = formatted.replace(/\n/g, '<br>');
    
    mathBlocks.forEach((block, idx) => {
        formatted = formatted.replace(`___MATH_BLOCK_${idx}___`, block);
    });

    if ((formatted.includes("List I") && formatted.includes("List II")) || 
        (formatted.includes("Column I") && formatted.includes("Column II"))) {
        formatted = formatted.replace(/(List[-\s]*I|Column[-\s]*I)/i, "<div class='match-table-wrapper'><div class='match-grid'><div class='match-header'>$1</div>");
        formatted = formatted.replace(/(List[-\s]*II|Column[-\s]*II)/i, "<div class='match-header'>$1</div>");
        formatted = formatted.replace(/(?:\s|^|<br>)(\([A-E]\)|[A-E]\.)/g, "<div class='match-cell left'><b>$1</b> ");
        formatted = formatted.replace(/(?:\s|^|<br>)(\([I|V|X]+\)|[I|V|X]+\.|\([P-T]\)|[P-T]\.)/g, "</div><div class='match-cell right'><b>$1</b> ");
        formatted += "</div></div></div>";
        formatted = formatted.replace(/<div class='match-cell right'><b>.*?<\/div><\/div><\/div>/g, "$&</div></div>");
    }
    return injectInlineImages(formatted); 
}

function markdownTableToHTML(text) {
    if (typeof text !== 'string') text = String(text || "");
    if (!text.includes('|')) return text;
    
    const lines = text.split('\n');
    let result = [];
    let inTable = false;
    let tableRows = [];

    for (let line of lines) {
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
            if (!inTable) {
                inTable = true;
                tableRows = [];
            }
            tableRows.push(line);
        } else {
            if (inTable) {
                result.push(renderHTMLTable(tableRows));
                inTable = false;
            }
            result.push(line);
        }
    }
    if (inTable) result.push(renderHTMLTable(tableRows));
    return result.join('\n');
}

function renderHTMLTable(rows) {
    let html = '<table>';
    rows.forEach((row, idx) => {
        const cells = row.split('|').filter(c => c.trim() !== '' || row.indexOf('|'+c+'|') !== -1).map(c => c.trim());
        if (cells.every(c => c.match(/^[ :\-\s]+$/))) return;
        html += '<tr>';
        cells.forEach(cell => {
            const tag = idx === 0 ? 'th' : 'td';
            html += `<${tag}>${cell}</${tag}>`;
        });
        html += '</tr>';
    });
    html += '</table>';
    return html;
}

function formatChapterName(slug) {
    if (!slug) return "Unknown Chapter";
    const overrides = {
        "3d-geometry": "3D Geometry",
        "d-and-f-block-elements": "d and f-Block Elements",
        "p-block-elements": "p-Block Elements",
        "s-block-elements": "s-Block Elements",
        "some-basic-concepts-of-chemistry": "Basic Concepts of Chemistry"
    };
    if (overrides[slug.toLowerCase()]) return overrides[slug.toLowerCase()];
    
    return slug.split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function determineSubject(chapterSlug) {
    const slug = (chapterSlug || "").toLowerCase();
    if (slug.match(/(physics|kinematics|motion|energy|work|power|gravitation|thermodynamics|kinetic|oscillation|wave|electrostatics|electric|magnetic|emi|alternating|optics|dual-nature|atom|nuclei|semiconductor|communication|measurement)/)) return "Physics";
    if (slug.match(/(chemistry|atom|period|bond|state|thermo|equilibrium|redox|hydrogen|s-block|p-block|d-and-f|coordination|environment|organic|hydrocarbon|haloalkane|alcohol|aldehyde|ketone|amine|polymer|biomolecule|everyday|metallurgy)/)) return "Chemistry";
    if (slug.match(/(math|set|relation|function|trig|algebra|quadratic|complex|matrix|matrices|determinant|permutation|combination|binomial|sequence|series|limit|continuity|differentia|derivative|integral|equation|coordinate|straight|circle|conic|vector|3d|statistics|probability|reasoning|area|integration|ellipse|height-and-distance)/)) return "Mathematics";
    if (slug.match(/(bio|botany|zoology|reproduction|genetics|cell|diversity|structural|plant|human|health|microbe|ecology|environment)/)) return "Biology";
    return "Uncategorized";
}

window.navigateToGateway = () => {
    screenGateway.style.display = 'block';
    screenExplorer.style.display = 'none';
    screenList.style.display = 'none';
    screenFocus.style.display = 'none';
};
const EXAM_CONFIG = {
    "JEE Mains": {
        table: "jee-main",
        subjects: ["Physics", "Chemistry", "Mathematics"]
    },
    "NEET": {
        table: "neet",
        subjects: ["Physics", "Chemistry", "Biology"]
    },
    "JEE Advanced": {
        table: "jee-advanced", // Maps to the table name in Supabase
        subjects: ["Physics", "Chemistry", "Mathematics"]
    },
    "MHTCET": {
        table: "mhtcet", // Maps to the table name in Supabase
        subjects: ["Physics", "Chemistry", "Mathematics"]
    },
    "BITSAT": {
        table: "bitsat", // Maps to the table name in Supabase
        subjects: ["Physics", "Chemistry", "Mathematics", "English", "Logical Reasoning"]
    },
    "COMEDK": {
        table: "comedk", // Maps to the table name in Supabase
        subjects: ["Physics", "Chemistry", "Mathematics"]
    },
    "BITSAT": {
        table: "bitsat", // Maps to the table name in Supabase
        subjects: ["Physics", "Chemistry", "Mathematics", "English", "Logical Reasoning"]
    },
    "BITSAT": {
        table: "bitsat", // Maps to the table name in Supabase
        subjects: ["Physics", "Chemistry", "Mathematics", "English", "Logical Reasoning"]
    },
    "BITSAT": {
        table: "bitsat", // Maps to the table name in Supabase
        subjects: ["Physics", "Chemistry", "Mathematics", "English", "Logical Reasoning"]
    },
    "BITSAT": {
        table: "bitsat", // Maps to the table name in Supabase
        subjects: ["Physics", "Chemistry", "Mathematics", "English", "Logical Reasoning"]
    },
    "BITSAT": {
        table: "bitsat", // Maps to the table name in Supabase
        subjects: ["Physics", "Chemistry", "Mathematics", "English", "Logical Reasoning"]
    },
    "BITSAT": {
        table: "bitsat", // Maps to the table name in Supabase
        subjects: ["Physics", "Chemistry", "Mathematics", "English", "Logical Reasoning"]
    },
    "BITSAT": {
        table: "bitsat", // Maps to the table name in Supabase
        subjects: ["Physics", "Chemistry", "Mathematics", "English", "Logical Reasoning"]
    },
};

window.navigateToExplorer = async (examName) => {
    selectedTargetExam = examName;
    document.getElementById('explorer-title').innerText = `${examName} Workspace`;
    screenGateway.style.display = 'none';
    screenExplorer.style.display = 'block';
    
    const sidebarContainer = document.getElementById('subject-sidebar-container');
    const chapterListContainer = document.getElementById('chapter-list-container');
    
    if (!isDatabaseLoaded) {
        sidebarContainer.innerHTML = '<div style="padding: 1rem; color: var(--text-muted); font-size: 0.9rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading Architecture...</div>';
        await loadDatabaseInBackground(); 
    }
    
    sidebarContainer.innerHTML = "";
    chapterListContainer.innerHTML = "";

    try {
        // 1. Get the exam configuration or fallback to empty defaults
        const config = EXAM_CONFIG[examName] || { table: examName.toLowerCase().replace(/\s+/g, '-'), subjects: [] };
        
        let targetTable = config.table;
        let validSubjects = config.subjects;

        let examMeta = globalMetadata.filter(row => row.source_table === targetTable);
        
        activeMetadata = {};
        validSubjects.forEach(sub => activeMetadata[sub] = {});
        
        examMeta.forEach(row => {
            let sub = row.subject ? row.subject.trim() : "";
            
            if (!sub || sub === "Uncategorized" || sub === "General") {
                sub = determineSubject(row.chapter);
            } else {
                // Normalize common subjects
                if (sub.toLowerCase().includes("phys")) sub = "Physics";
                else if (sub.toLowerCase().includes("chem")) sub = "Chemistry";
                else if (sub.toLowerCase().includes("math")) sub = "Mathematics";
                else if (sub.toLowerCase().match(/(bio|botany|zoology)/)) sub = "Biology"; 
                // Add specific routing for non-science subjects if needed
                else if (sub.toLowerCase().includes("english")) sub = "English";
                else if (sub.toLowerCase().includes("reasoning")) sub = "Logical Reasoning";
            }
            
            if (validSubjects.includes(sub)) {
                const rawCh = row.chapter ? row.chapter.trim() : "Uncategorized";
                const displayCh = formatChapterName(rawCh);
                
                // Metadata format remains strictly unchanged
                if (!activeMetadata[sub][displayCh]) {
                    activeMetadata[sub][displayCh] = { originalSlug: rawCh, count: 0 };
                }
                activeMetadata[sub][displayCh].count += parseInt(row.total_questions);
            }
        });
        
        const availableSubjects = Object.keys(activeMetadata).filter(sub => Object.keys(activeMetadata[sub]).length > 0);
        
        if (availableSubjects.length === 0) {
            sidebarContainer.innerHTML = `<div style="padding: 1rem; color: var(--text-muted);">No questions found for ${examName}.</div>`;
            return;
        }

        availableSubjects.forEach((sub, idx) => {
            const btn = document.createElement('button');
            btn.className = `sidebar-btn ${idx === 0 ? 'active' : ''}`;
            btn.innerHTML = `<span>${sub}</span> <i class="fa-solid fa-chevron-right" style="font-size: 0.8rem;"></i>`;
            btn.onclick = () => {
                document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderChapterInventoryList(sub);
            };
            sidebarContainer.appendChild(btn);
        });

        renderChapterInventoryList(availableSubjects[0]);

    } catch (error) { 
        console.error(error); 
        sidebarContainer.innerHTML = `<div style="color: var(--error-red); padding: 1rem;">${error.message}</div>`;
    }
};

async function loadDatabaseInBackground() {
    if (isDatabaseLoaded) return;
    if (databaseLoadPromise) return databaseLoadPromise;

    databaseLoadPromise = (async () => {
        try {
            console.log("Fetching lightweight metadata view...");
            const { data, error } = await supabase
                .from('exam_chapter_metadata')
                .select('*');
            
            if (error) throw new Error("Metadata fetch failed: " + error.message);
            
            globalMetadata = data || [];
            
            if (globalMetadata.length === 0) {
                console.warn("⚠️ View returned 0 rows! Check Supabase RLS policies for the view.");
            }

            isDatabaseLoaded = true;
            console.log(`✅ Loaded metadata for ${globalMetadata.length} chapter groupings instantly.`);
        } catch (error) {
            console.error("Background load error:", error);
        }
    })();

    return databaseLoadPromise;
}

loadDatabaseInBackground();

function renderChapterInventoryList(subjectName) {
    selectedActiveSubject = subjectName;
    const container = document.getElementById('chapter-list-container');
    container.innerHTML = "";
    
    const chapterMap = activeMetadata[subjectName] || {};
    
    const chapters = Object.keys(chapterMap).map(displayTitle => ({
        displayName: displayTitle,
        originalSlug: chapterMap[displayTitle].originalSlug,
        total: chapterMap[displayTitle].count
    }));
    
    if (chapters.length === 0) {
        container.innerHTML = `<div style="padding: 2rem; color: var(--text-muted); text-align: center;">No chapters available in database for ${subjectName}.</div>`;
        return;
    }

    chapters.sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    chapters.forEach(ch => {
        const divRow = document.createElement('div');
        divRow.className = "chapter-row";
        divRow.innerHTML = `
            <div class="chapter-title-wrapper">
                <i class="fa-solid fa-book-open"></i>
                <span class="chapter-name">${ch.displayName}</span>
            </div>
            <div class="chapter-stats"><span>${ch.total} Qs</span></div>
        `;
        divRow.onclick = () => launchSession(subjectName, ch.originalSlug, ch.displayName);
        container.appendChild(divRow);
    });
}

function generateQuestionId(qText) {
    let hash = 0;
    if(!qText) return "0";
    for (let i = 0; i < qText.length; i++) {
        hash = ((hash << 5) - hash) + qText.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString();
}

window.launchSession = async (subjectName, chapterSlug, chapterDisplayName) => {
    selectedActiveSubject = subjectName;
    selectedActiveChapter = chapterSlug; 

    const displayTitle = chapterDisplayName || formatChapterName(chapterSlug);

    document.getElementById('list-badge-subject').innerHTML = `<i class="fa-solid fa-book"></i> ${selectedActiveSubject}`;
    document.getElementById('list-badge-chapter').innerHTML = `<i class="fa-solid fa-list"></i> ${displayTitle}`;
    document.getElementById('focus-badge-subject').innerHTML = `<i class="fa-solid fa-book"></i> ${selectedActiveSubject}`;
    document.getElementById('focus-badge-chapter').innerHTML = `<i class="fa-solid fa-list"></i> ${displayTitle}`;
    
    screenExplorer.style.display = 'none';
    screenList.style.display = 'block';
    
    document.getElementById('index-list-container').innerHTML = '<div style="text-align:center; padding: 4rem; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><br><br>Downloading Question Bank...</div>';

    try {
        // DYNAMIC ROUTING: Uses the EXAM_CONFIG object instead of if/else
        let targetTable = EXAM_CONFIG[selectedTargetExam]?.table;
        
        if (!targetTable) {
            throw new Error(`Table mapping not found for exam: ${selectedTargetExam}`);
        }

        const { data, error } = await supabase
            .from(targetTable)
            .select('data')
            .eq('data->>chapter', chapterSlug);

        if (error) throw error;

        let rawQuestions = (data || []).map(row => {
            return typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        });
        
        if(rawQuestions.length === 0) {
            document.getElementById('index-list-container').innerHTML = '<div style="text-align:center; padding: 4rem; color: var(--error-red);">No questions available for this chapter.</div>';
            return;
        }

        filteredPracticeSet = rawQuestions.map(q => ({
            ...q,
            q: q.q_en, 
            uid: q.question_id || `${generateQuestionId(q.q_en || "")}`
        }));

        filteredPracticeSet.sort((a, b) => {
            const getTimestamp = (q) => {
                const year = parseInt(q.year) || 0;
                const months = { 'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12 };
                let month = 0; let day = 0;
                if (q.date) {
                    const dateParts = q.date.toLowerCase();
                    for (let m in months) if (dateParts.includes(m)) month = months[m];
                    const dayMatch = dateParts.match(/\d+/);
                    if (dayMatch) day = parseInt(dayMatch[0]);
                }
                return (year * 10000) + (month * 100) + day;
            };

            const timeA = getTimestamp(a);
            const timeB = getTimestamp(b);
            if (timeB !== timeA) return timeB - timeA;

            const shiftOrder = { "morning": 1, "afternoon": 2, "evening": 3 };
            const shiftA = shiftOrder[a.shift?.toLowerCase()] || 4;
            const shiftB = shiftOrder[b.shift?.toLowerCase()] || 4;
            return shiftA - shiftB;
        });

        renderIndexList();
    } catch (error) {
        console.error("Targeted fetch error:", error);
        document.getElementById('index-list-container').innerHTML = '<div style="text-align:center; padding: 4rem; color: var(--error-red);">Failed to fetch the question bank from server.</div>';
    }
};

window.abortSession = () => {
    screenList.style.display = 'none';
    screenExplorer.style.display = 'block';
};

window.returnToList = () => {
    renderIndexList(); 
    screenFocus.style.display = 'none';
    screenList.style.display = 'block';
};

function getCleanPreview(text) {
    if (!text) return "";
    let cleanText = String(text);

    // 1. Remove image markdown tokens completely [IMG: ...]
    cleanText = cleanText.replace(/\[IMG:\s*([^\]]+)\]/g, '');

    // 2. Remove all MathJax/LaTeX blocks completely WITHOUT the [Math] placeholder
    cleanText = cleanText.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[\s\S]*?\$|\\\([\s\S]*?\\\))/g, ' ');

    // 3. Strip out any raw HTML tags (like <div>, <img>, etc.) so they don't leak out
    cleanText = cleanText.replace(/<[^>]*>/g, '');

    // 4. Clean up whitespace and newlines
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    // 5. Safely truncate the clean, plain text string
    if (cleanText.length > 160) {
        cleanText = cleanText.substring(0, 160) + '...';
    }
    
    return cleanText;
}

function renderIndexList() {
    const container = document.getElementById('index-list-container');
    container.innerHTML = "";
    let completedCount = 0;

    filteredPracticeSet.forEach((q, index) => {
        const isCorrect = correctIds.includes(q.uid);
        const isWrong = wrongIds.includes(q.uid);
        if (isCorrect || isWrong) completedCount++;

        let badgeHtml = `<div class="status-badge badge-pending"><i class="fa-solid fa-circle-minus"></i> Pending</div>`;
        if (isCorrect) badgeHtml = `<div class="status-badge badge-correct"><i class="fa-solid fa-check"></i> Correct</div>`;
        if (isWrong) badgeHtml = `<div class="status-badge badge-wrong"><i class="fa-solid fa-xmark"></i> Incorrect</div>`;

        const dText = (q.date && q.date !== "Unknown" && q.date !== "Unknown Date") ? q.date : "";
        const yText = (q.year && q.year !== "Unknown" && q.year !== "Unknown Year") ? q.year : "";
        const fullDateStr = [dText, yText].filter(Boolean).join(" ") || "Date Unknown";
        
        let shiftBadgeHtml = '';
        if (q.shift && q.shift !== "Unknown" && q.shift !== "Unknown Shift") {
            shiftBadgeHtml = `<span style="background: rgba(255, 255, 255, 0.05); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1);"><i class="fa-regular fa-clock"></i> ${q.shift} Shift</span>`;
        }

        const rowHtml = `
            <div class="index-row" onclick="openFocusQuestion(${index})">
                <div class="index-q-wrapper">
                    <div class="index-q-text">
                        <span style="color:#818cf8; font-weight:700; margin-right: 4px;">Q${index + 1}.</span>${getCleanPreview(q.q)}
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-tertiary); margin-top: 10px; display: flex; gap: 12px; align-items: center; font-weight: 500;">
                        <span style="color: var(--gold); background: rgba(251, 191, 36, 0.1); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(251, 191, 36, 0.2);"><i class="fa-regular fa-calendar"></i> ${fullDateStr}</span>
                        ${shiftBadgeHtml}
                    </div>
                </div>
                <div class="index-status-wrapper">
                    ${badgeHtml}
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', rowHtml);
    });

    document.getElementById('list-progress-tracker').innerText = `${completedCount} / ${filteredPracticeSet.length} Completed`;
    setTimeout(() => triggerMathRender('index-list-container'), 100);
}

window.openFocusQuestion = (index) => {
    if (aiAbortController) {
        aiAbortController.abort();
        aiAbortController = null;
    }
    isAIGenerating = false;
    
    document.getElementById('ai-explanation-text').innerHTML = `
        <p style="color: var(--text-muted); font-style: italic; text-align: center; margin-top: 20px;">
            <i class="fa-solid fa-robot"></i> Click "AI Tutor" to generate an explanation.
        </p>
    `;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-btn')[0].classList.add('active');
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById('tab-standard').classList.add('active');

    currentFocusIndex = index;
    isFocusAnswerChecked = false;
    selectedOptionIndex = null;
    window.selectedOptions = []; 
    
    const q = filteredPracticeSet[index];
    const isCorrect = correctIds.includes(q.uid);
    const isWrong = wrongIds.includes(q.uid);
    const isAttempted = isCorrect || isWrong;

    document.getElementById('btn-check-focus').style.display = 'block';
    document.getElementById('btn-check-focus').disabled = true;
    document.getElementById('btn-next-focus').style.display = 'none';
    document.getElementById('focus-explanation-box').style.display = 'none';
    document.getElementById('focus-result-status').innerHTML = "";
    
    document.getElementById('focus-progress-tracker').innerText = `Question ${index + 1} of ${filteredPracticeSet.length}`;
    
    const dText = (q.date && q.date !== "Unknown" && q.date !== "Unknown Date") ? q.date : "";
    const yText = (q.year && q.year !== "Unknown" && q.year !== "Unknown Year") ? q.year : "";
    const fullDateStr = [dText, yText].filter(Boolean).join(" ") || "Date Unknown";
    
    let shiftBadgeFocus = '';
    if (q.shift && q.shift !== "Unknown" && q.shift !== "Unknown Shift") {
        shiftBadgeFocus = `<span class="marks-tag tag-chapter" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${q.shift} Shift</span>`;
    }

    document.getElementById('focus-q-meta').innerHTML = `
        <span class="marks-tag tag-subject" style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); color: #818cf8;"><i class="fa-solid fa-graduation-cap"></i> ${selectedTargetExam}</span>
        <span class="marks-tag tag-year"><i class="fa-regular fa-calendar"></i> ${fullDateStr}</span>
        ${shiftBadgeFocus}
    `;
    
    document.getElementById('focus-q-text').innerHTML = formatQuestionBody(q.q);

    const optContainer = document.getElementById('focus-options-container');
    optContainer.innerHTML = "";

    if (q.type === "numerical" || q.type === "integer") {
        const inputDiv = document.createElement('div');
        inputDiv.className = "integer-input-container";
        inputDiv.innerHTML = `
            <p style="margin-bottom: 0.8rem; color: var(--text-muted); font-size: 0.9rem; font-weight: 600; text-align: center;">ENTER NUMERICAL VALUE:</p>
            <input type="number" step="any" class="integer-field" id="focus-integer-input" placeholder="0.00" oninput="handleIntegerInput()">
        `;
        optContainer.appendChild(inputDiv);
        if (isAttempted) {
            const field = document.getElementById('focus-integer-input');
            field.value = localStorage.getItem(`answer_${q.uid}`) || q.answer;
            field.disabled = true;
            field.classList.add(isCorrect ? 'correct' : 'wrong');
        }
    } else {
        q.options.forEach((opt, optIdx) => {
            const codeMarker = String.fromCharCode(65 + optIdx);
            const div = document.createElement('div');
            div.className = `marks-option ${isAttempted ? 'locked' : ''} ${q.type === 'multi_select' ? 'multi-select-option' : ''}`;
            div.id = `focus-opt-${optIdx}`;
            
            div.innerHTML = `
                <div class="opt-letter">${codeMarker}</div>
                <div class="opt-text">${formatGenericText(opt)}</div>
                <i class="fa-solid fa-circle-check opt-icon check-icon" id="focus-check-${optIdx}"></i>
                <i class="fa-solid fa-circle-xmark opt-icon cross-icon" id="focus-cross-${optIdx}"></i>
            `;

            if (!isAttempted) {
                div.onclick = () => q.type === 'multi_select' ? toggleMultiOption(optIdx) : selectFocusOption(optIdx);
            }
            optContainer.appendChild(div);
        });
    }

    if (isAttempted) {
        document.getElementById('btn-check-focus').style.display = 'none';
        document.getElementById('btn-next-focus').style.display = 'block';
        
        document.getElementById('focus-explanation-text').innerHTML = formatGenericText(q.explanation);
        document.getElementById('focus-explanation-box').style.display = 'block';
        
        if (q.type !== "numerical" && q.type !== "integer") {
            const correctAnswers = Array.isArray(q.answer) ? q.answer.map(a => Number(a)) : [Number(q.answer)];
            const savedChoice = localStorage.getItem(`chosen_${q.uid}`);
            
            correctAnswers.forEach(ansIdx => {
                const optEl = document.getElementById(`focus-opt-${ansIdx}`);
                if(optEl) optEl.classList.add('correct');
                const checkEl = document.getElementById(`focus-check-${ansIdx}`);
                if(checkEl) checkEl.style.display = 'block';
            });

            if (isWrong && savedChoice !== null) {
                const wrongIdx = Number(savedChoice);
                const wrongOptEl = document.getElementById(`focus-opt-${wrongIdx}`);
                if (wrongOptEl) wrongOptEl.classList.add('wrong');
                const crossEl = document.getElementById(`focus-cross-${wrongIdx}`);
                if (crossEl) crossEl.style.display = 'block';
            }
        }
        
        if (isCorrect) {
            document.getElementById('focus-result-status').innerHTML = `<span style="color: var(--success-green);"><i class="fa-solid fa-check"></i> Solved Correctly</span>`;
        } else {
            document.getElementById('focus-result-status').innerHTML = `<span style="color: var(--error-red);"><i class="fa-solid fa-xmark"></i> Solved Incorrectly</span>`;
        }
    }

    screenList.style.display = 'none';
    screenFocus.style.display = 'block';
    window.scrollTo(0, 0);
    setTimeout(() => triggerMathRender('quiz-focus-screen'), 100);
};

window.handleIntegerInput = () => {
    const val = document.getElementById('focus-integer-input').value;
    document.getElementById('btn-check-focus').disabled = val === "";
};

window.toggleMultiOption = (optIndex) => {
    if (isFocusAnswerChecked) return;
    const idx = window.selectedOptions.indexOf(optIndex);
    if (idx > -1) window.selectedOptions.splice(idx, 1);
    else window.selectedOptions.push(optIndex);
    
    document.getElementById(`focus-opt-${optIndex}`).classList.toggle('selected');
    document.getElementById('btn-check-focus').disabled = window.selectedOptions.length === 0;
};

window.selectFocusOption = async (optIndex) => {
    if (isFocusAnswerChecked) return;
    selectedOptionIndex = optIndex;

    const q = filteredPracticeSet[currentFocusIndex];
    if (q) {
        q.studentAnswer = optIndex; 
        localStorage.setItem(`chosen_${q.uid}`, optIndex);
    }

    document.querySelectorAll('#focus-options-container .marks-option').forEach(el => el.classList.remove('selected'));
    document.getElementById(`focus-opt-${optIndex}`).classList.add('selected');
    document.getElementById('btn-check-focus').disabled = false;

    if (currentUser && q) {
        const questionId = q.id || `q_${currentFocusIndex}`;
        try {
            const token = await currentUser.getIdToken();
            await fetch(LAMBDA_URL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    action: 'saveResponse',
                    uid: currentUser.uid,
                    questionId: questionId,
                    questionText: q.q || "No text available",
                    selectedOption: q.studentAnswer,
                    correctOption: Number(q.answer), 
                    isCorrect: q.studentAnswer === Number(q.answer) 
                })
            });
        } catch (error) {
            console.error("Lambda sync error:", error);
        }
    }
};

window.evaluateFocusQuestion = async () => {
    isFocusAnswerChecked = true;
    const q = filteredPracticeSet[currentFocusIndex];
    let isCorrect = false;

    if (q.type === "mcq") {
        isCorrect = (selectedOptionIndex == q.answer);
    } else if (q.type === "multi_select") {
        const correctAnswers = Array.isArray(q.answer) ? q.answer.map(a => Number(a)) : [Number(q.answer)];
        isCorrect = window.selectedOptions.length === correctAnswers.length &&
                    window.selectedOptions.every(val => correctAnswers.includes(val));
    } else if (q.type === "numerical" || q.type === "integer") {
        const userVal = parseFloat(document.getElementById('focus-integer-input').value);
        const correctVal = parseFloat(q.answer);
        isCorrect = Math.abs(userVal - correctVal) < 0.01; 
        localStorage.setItem(`answer_${q.uid}`, userVal);
    }

    document.getElementById('btn-check-focus').style.display = 'none';
    document.getElementById('btn-next-focus').style.display = 'block';

    if (q.type === "numerical" || q.type === "integer") {
        const field = document.getElementById('focus-integer-input');
        field.disabled = true;
        field.classList.add(isCorrect ? 'correct' : 'wrong');
    } else {
        document.querySelectorAll('#focus-options-container .marks-option').forEach(el => el.classList.add('locked'));
        const correctAnswers = Array.isArray(q.answer) ? q.answer.map(a => Number(a)) : [Number(q.answer)];
        
        if (q.type === "mcq") {
            if (isCorrect) {
                document.getElementById(`focus-opt-${selectedOptionIndex}`).classList.add('correct');
                document.getElementById(`focus-check-${selectedOptionIndex}`).style.display = 'block';
            } else {
                document.getElementById(`focus-opt-${selectedOptionIndex}`).classList.add('wrong');
                document.getElementById(`focus-cross-${selectedOptionIndex}`).style.display = 'block';
            }
        } else {
            window.selectedOptions.forEach(optIdx => {
                if (correctAnswers.includes(optIdx)) {
                    document.getElementById(`focus-opt-${optIdx}`).classList.add('correct');
                    document.getElementById(`focus-check-${optIdx}`).style.display = 'block';
                } else {
                    document.getElementById(`focus-opt-${optIdx}`).classList.add('wrong');
                    document.getElementById(`focus-cross-${optIdx}`).style.display = 'block';
                }
            });
        }
        
        correctAnswers.forEach(ansIdx => {
            const optEl = document.getElementById(`focus-opt-${ansIdx}`);
            if(optEl) optEl.classList.add('correct');
            const checkEl = document.getElementById(`focus-check-${ansIdx}`);
            if(checkEl) checkEl.style.display = 'block';
        });
    }

    if (isCorrect) {
        document.getElementById('focus-result-status').innerHTML = `
            <div style="color: var(--success-green); font-size: 1.05rem;"><i class="fa-solid fa-check"></i> Correct</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Earned <span style="color: var(--gold); font-weight: 600;">+8 XP</span></div>
        `;
    } else {
        let displayCorrect = q.answer;
        if (q.type === "multi_select") {
            const arr = Array.isArray(q.answer) ? q.answer : [q.answer];
            displayCorrect = arr.map(idx => String.fromCharCode(65 + Number(idx))).join(", ");
        } else if (q.type === "mcq") {
            displayCorrect = String.fromCharCode(65 + Number(q.answer));
        }
        
        document.getElementById('focus-result-status').innerHTML = `
            <div style="color: var(--error-red); margin-bottom: 4px; font-size: 1.05rem;"><i class="fa-solid fa-xmark"></i> Incorrect Answer</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">Correct Answer: <span style="color: var(--success-green); font-weight: 700;">${displayCorrect}</span></div>
            <div style="font-size: 0.75rem; color: var(--danger); margin-top: 4px; font-weight: 500;">Penalty <span style="font-weight: 600;">-2 XP</span></div>
        `;
    }

    await updateFirebaseProgress(q.uid, isCorrect);
    
    document.getElementById('focus-explanation-text').innerHTML = formatGenericText(q.explanation);
    document.getElementById('focus-explanation-box').style.display = 'block';
    
    window.switchSolutionTab('standard');
    setTimeout(() => triggerMathRender('focus-explanation-box'), 100);
};

window.advanceToNextQuestion = () => {
    if (currentFocusIndex + 1 < filteredPracticeSet.length) {
        openFocusQuestion(currentFocusIndex + 1);
    } else {
        returnToList();
    }
};

async function updateFirebaseProgress(questionUid, isCorrect) {
    if (isCorrect && !correctIds.includes(questionUid)) {
        correctIds.push(questionUid);
    } else if (!isCorrect && !wrongIds.includes(questionUid)) {
        wrongIds.push(questionUid);
    }

    localStorage.setItem('studySpace_correctIds', JSON.stringify(correctIds));
    localStorage.setItem('studySpace_wrongIds', JSON.stringify(wrongIds));

    // --- ADD THIS BLOCK FOR HOGWARTS DASHBOARD SYNC ---
    let pendingCorrect = parseInt(localStorage.getItem("hp_pending_correct") || 0);
    let pendingIncorrect = parseInt(localStorage.getItem("hp_pending_incorrect") || 0);

    if (isCorrect) {
        localStorage.setItem("hp_pending_correct", pendingCorrect + 1);
    } else {
        localStorage.setItem("hp_pending_incorrect", pendingIncorrect + 1);
    }
    // --------------------------------------------------

    if(!currentUser) return; 
    const xpGain = isCorrect ? 8 : -2;

    try {
        const token = await currentUser.getIdToken();
        await fetch(LAMBDA_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                action: 'updateProgress',
                uid: currentUser.uid,
                questionId: questionUid,
                isCorrect: isCorrect,
                xpDelta: xpGain,
                userName: currentUser.displayName || "Scholar"
            })
        });
    } catch(e) {
        console.error("Lambda Progress Update Failed", e);
    }
}

window.switchSolutionTab = (tab) => {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    if (tab === 'standard') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('tab-standard').classList.add('active');
    } else if (tab === 'ai') {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('tab-ai').classList.add('active');
        
        const aiContainer = document.getElementById('ai-explanation-text');
        if (aiContainer.innerHTML.includes('Click "AI Tutor"')) {
            generateAISolution();
        }
    }
};

const getCompressedBase64 = (url) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const MAX_SIZE = 1024;
            let width = img.width;
            let height = img.height;
            
            if (width > height && width > MAX_SIZE) {
                height *= MAX_SIZE / width;
                width = MAX_SIZE;
            } else if (height > MAX_SIZE) {
                width *= MAX_SIZE / height;
                height = MAX_SIZE;
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.onerror = (err) => reject(err);
        img.src = url;
    });
};

window.generateAISolution = async () => {
    const aiTextContainer = document.getElementById('ai-explanation-text');
    const q = filteredPracticeSet[currentFocusIndex];
    if (!q) return;

    aiTextContainer.innerHTML = `
        <div class="ai-loading">
            <i class="fa-solid fa-circle-notch fa-spin fa-2x"></i>
            <br>Extracting & Analyzing Images...
        </div>
    `;

    try {
        if (aiAbortController) aiAbortController.abort();
        aiAbortController = new AbortController();

        const imagesToAnalyze = [];
        const imgRegex = /\[IMG:\s*([^\]]+)\]/g;
        const fullSearchText = q.q + " " + JSON.stringify(q.options || []);
        
        let match;
        while ((match = imgRegex.exec(fullSearchText)) !== null) {
            const filename = match[1].trim();
            if (filename !== "requires_image.png" && filename !== "null") {
                if (!imagesToAnalyze.find(img => img.label === filename)) {
                    try {
                        const rawUrl = `${CLOUDINARY_BASE_URL}${filename}`;
                        const base64Data = await getCompressedBase64(rawUrl);
                        imagesToAnalyze.push({
                            label: filename,
                            base64: base64Data
                        });
                    } catch (e) { console.error("Could not process image on frontend:", filename); }
                }
            }
        }

        const cleanPrompt = q.q.replace(/\[IMG:\s*[^\]]+\]/g, "[See Attached Image]");
        const isCorrectHistory = correctIds.includes(q.uid);
        const isWrongHistory = wrongIds.includes(q.uid);
        
        let studentStatus = "Did not attempt (Asked for help)";
        if (isCorrectHistory) {
            studentStatus = "Student attempted and answered CORRECTLY.";
        } else if (isWrongHistory) {
            const savedChoice = localStorage.getItem(`chosen_${q.uid}`);
            if (q.type === 'numerical' || q.type === 'integer') {
                const savedInt = localStorage.getItem(`answer_${q.uid}`);
                studentStatus = savedInt !== null ? `Student answered INCORRECTLY. They typed: ${savedInt}` : "Student answered INCORRECTLY.";
            } else {
                if (savedChoice !== null) {
                    const letters = ['A', 'B', 'C', 'D'];
                    const letterChosen = letters[savedChoice] !== undefined ? letters[savedChoice] : savedChoice;
                    studentStatus = `Student answered INCORRECTLY. They chose Option ${letterChosen}.`;
                } else {
                    studentStatus = "Student answered INCORRECTLY.";
                }
            }
        } else if (q.studentAnswer !== undefined && q.studentAnswer !== null) {
            const letters = ['A', 'B', 'C', 'D'];
            const tempLetter = letters[q.studentAnswer] !== undefined ? letters[q.studentAnswer] : q.studentAnswer;
            studentStatus = `Student is currently considering Option ${tempLetter} but hasn't submitted yet.`;
        }
        
        let correctDisplay = q.answer;
        if (q.type === 'mcq') {
            const letters = ['A', 'B', 'C', 'D'];
            correctDisplay = `Option ${letters[q.answer] !== undefined ? letters[q.answer] : q.answer}`;
        } else if (q.type === 'multi_select') {
            const letters = ['A', 'B', 'C', 'D'];
            const arr = Array.isArray(q.answer) ? q.answer : [q.answer];
            correctDisplay = "Options " + arr.map(a => letters[a] || a).join(', ');
        }

        const fullPrompt = `Question Body:
${cleanPrompt}

Options provided:
${JSON.stringify(q.options || [])}

Correct Answer: ${correctDisplay}
Student's Status: ${studentStatus}

Instructions: Please solve this step-by-step. 
- If the Student's Status says "CORRECTLY", start by congratulating them on getting it right, then provide the optimal mathematical proof.
- If the Student's Status shows an INCORRECT answer, gently explain the exact misconception that led to their specific wrong choice before solving it. 
- If they asked for help without attempting, guide them from scratch.`;

        const AI_LAMBDA_ENDPOINT = "https://tt6t4ollujq3rlwxibdoqtvt340monfz.lambda-url.us-east-1.on.aws/";
        const response = await fetch(AI_LAMBDA_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt: fullPrompt,
                images: imagesToAnalyze
            }),
            signal: aiAbortController.signal
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let accumulatedText = "";
        let streamBuffer = ""; 
        
        aiTextContainer.innerHTML = ""; 

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            streamBuffer += decoder.decode(value, { stream: true });
            const lines = streamBuffer.split('\n');
            streamBuffer = lines.pop(); 
            
            for (const line of lines) {
                const cleanLine = line.trim();
                if (cleanLine.startsWith('data: ') && !cleanLine.includes('[DONE]')) {
                    try {
                        const dataObj = JSON.parse(cleanLine.substring(6));
                        const deltaContent = dataObj.choices[0]?.delta?.content || "";
                        accumulatedText += deltaContent;
                        aiTextContainer.innerHTML = formatGenericText(accumulatedText);
                    } catch (e) {}
                }
            }
        }

        aiTextContainer.innerHTML = formatGenericText(accumulatedText);
        setTimeout(() => triggerMathRender('ai-explanation-text'), 300);

    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error("Lambda Fetch Failed:", error);
            aiTextContainer.innerHTML = `<div style="color: red;">Failed to reach backend.</div>`;
        }
    } finally {
        isAIGenerating = false;
    }
};

window.clearUserProgress = async () => {
    if (!currentUser) {
        alert("You must be signed in to reset your progress tracker.");
        return;
    }

    const confirmReset = confirm("Are you sure you want to completely wipe all your scores, badges, and question attempts? This will completely reset your profile.");
    if (!confirmReset) return;

    try {
        const token = await currentUser.getIdToken();
        await fetch(LAMBDA_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                action: 'clearProgress',
                uid: currentUser.uid
            })
        });

        localStorage.clear();
        sessionStorage.clear();
        alert("Profile history successfully reset! Reloading layout...");
        window.location.reload();
    } catch (error) {
        console.error("Purge failure exception:", error.message);
        alert(`An error occurred while clearing your progress: ${error.message}`);
    }
};