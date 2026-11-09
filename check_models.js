// check_models.js
const OPENAI_KEY = '' // Commence par sk-...
const GEMINI_KEY = '' // Commence par AIza...

async function checkOpenAI() {
    if (OPENAI_KEY === 'ta_cle_openai_ici') return console.log('⚠️ Pas de clé OpenAI')
    try {
        const res = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${OPENAI_KEY}` }
        })
        const data = await res.json()
        console.log('\n=== Modèles OpenAI disponibles ===')
        const gptModels = data.data
            .map(m => m.id)
            .filter(id => id.includes('gpt'))
            .sort()
        console.log(gptModels.join('\n'))
    } catch (err) {
        console.error('Erreur OpenAI:', err)
    }
}

async function checkGemini() {
    if (GEMINI_KEY === 'ta_cle_gemini_ici') return console.log('⚠️ Pas de clé Gemini')
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}`)
        const data = await res.json()
        console.log('\n=== Modèles Gemini disponibles ===')
        const geminiModels = data.models
            .map(m => m.name.replace('models/', ''))
            .filter(name => name.includes('gemini'))
            .sort()
        console.log(geminiModels.join('\n'))
    } catch (err) {
        console.error('Erreur Gemini:', err)
    }
}

checkGemini()