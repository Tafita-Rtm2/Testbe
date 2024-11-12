const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');
const fs = require('fs');
const path = require('path');

// Lecture du token d'accès pour l'envoi des messages
const token = fs.readFileSync('token.txt', 'utf8');

// Dictionnaire pour suivre le dernier horodatage de chaque utilisateur
const lastUsage = {};

// Configuration du répertoire de cache
const cacheDir = path.join(__dirname, './cache');
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}

// Fonction pour traduire le texte en anglais
async function translateText(text) {
    const translateURL = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    try {
        const response = await axios.get(translateURL);
        return response.data[0][0][0];
    } catch (error) {
        console.error('Translation error:', error.message);
        throw new Error('Error translating text');
    }
}

module.exports = {
    name: 'image',
    description: 'Generate an AI-based image',
    author: 'Tafita',
    usage: 'imagine',

    async execute(senderId, args) {
        const pageAccessToken = token;
        const prompt = args.join(' ').trim();

        // Vérifie que l'utilisateur a bien entré une commande
        if (!prompt) {
            return await sendMessage(senderId, { text: 'Please provide a prompt for the image generator.' }, pageAccessToken);
        }

        // Vérifier l'intervalle de 2 minutes pour cet utilisateur
        const currentTime = Date.now();
        const cooldownPeriod = 2 * 60 * 1000; // 2 minutes en millisecondes

        if (lastUsage[senderId] && currentTime - lastUsage[senderId] < cooldownPeriod) {
            const remainingTime = Math.ceil((cooldownPeriod - (currentTime - lastUsage[senderId])) / 1000);
            return await sendMessage(senderId, { text: `Please wait ${remainingTime} seconds before using this command again.` }, pageAccessToken);
        }

        // Mettre à jour le dernier horodatage d'utilisation de la commande
        lastUsage[senderId] = currentTime;

        // Traduction du texte
        let translatedPrompt;
        try {
            translatedPrompt = await translateText(prompt);
        } catch (error) {
            return await sendMessage(senderId, { text: 'Failed to translate the prompt.' }, pageAccessToken);
        }

        // Tentatives multiples pour générer l'image
        const maxRetries = 3;
        let attempt = 0;

        while (attempt < maxRetries) {
            try {
                // Envoi d'un message pour notifier l'utilisateur de la génération
                await sendMessage(senderId, { text: 'Generation de l image en cours...🤖' }, pageAccessToken);

                // Appel à l'API pour générer l'image
                const response = await axios.post("https://imagine-ayoub.vercel.app/generate-image", { prompt: translatedPrompt });
                const images = response.data.images;

                if (images && images.length > 0) {
                    // Cache les images générées
                    const cachedImages = images.map((imageData, index) => {
                        const imageBuffer = Buffer.from(imageData, 'binary');
                        const filePath = path.join(cacheDir, `cache_${index}.png`);
                        fs.writeFileSync(filePath, imageBuffer);
                        return filePath;
                    });

                    // Envoie les images en pièces jointes
                    const attachments = cachedImages.map(filePath => fs.createReadStream(filePath));

                    await sendMessage(senderId, {
                        body: "Images generated successfully",
                        attachment: attachments
                    }, pageAccessToken);
                    
                    return; // Arrêter après un envoi réussi
                } else {
                    throw new Error('Failed to generate image. Please try a different prompt.');
                }

            } catch (error) {
                console.error(`Attempt ${attempt + 1} - Error response:`, error.response ? JSON.stringify(error.response.data) : error.message);
                attempt++;
                if (attempt >= maxRetries) {
                    const errorMessage = error.response && error.response.data && error.response.data.error ? error.response.data.error : error.message;
                    await sendMessage(senderId, { text: `An error occurred while processing the request - ${errorMessage}` }, pageAccessToken);
                }
            }
        }
    }
};
