// api/chat.js
export default async function handler(req, res) {
    // 1. Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 2. Get the question details sent from your frontend
        const { prompt } = req.body;

        // 3. Securely grab the API key from the Server Environment (hidden from users)
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

        // 4. Talk to Gemini
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7 }
            })
        });

        const data = await response.json();
        const aiText = data.candidates[0].content.parts[0].text;

        // 5. Send the answer back to your frontend
        res.status(200).json({ text: aiText });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to generate AI response' });
    }
}