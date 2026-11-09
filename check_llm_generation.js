// test_gemini.js
const API_KEY = '';

const MODELS_TO_TEST = [
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-3.6-flash',
    'gemini-3.8-flash'
];

const prompt = "Quelle est la capitale de la France ? Réponds uniquement par le nom de la ville.";

async function testModel(modelName) {
    console.log(`\n⏳ Test de [${modelName}]...`);
    const startTime = Date.now();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // Coupe après 10 secondes !

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const elapsed = Date.now() - startTime;

        if (!res.ok) {
            const errText = await res.text();
            console.error(`❌ ÉCHEC (${res.status}) en ${elapsed}ms : ${errText.trim()}`);
            return;
        }

        const data = await res.json();
        const text = data.candidates[0].content.parts[0].text;
        console.log(`✅ SUCCÈS en ${elapsed}ms : "${text.trim()}"`);

    } catch (err) {
        if (err.name === 'AbortError') {
            console.error(`❌ TIMEOUT : L'API n'a pas répondu au bout de 10 secondes.`);
        } else {
            console.error(`❌ CRASH RÉSEAU : ${err.message}`);
        }
    }
}

async function runTests() {
    for (const model of MODELS_TO_TEST) {
        await testModel(model);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Pause de 2s
    }
    console.log("\n🏁 Tests terminés !");
}

runTests();