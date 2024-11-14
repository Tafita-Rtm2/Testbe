const axios = require('axios');
const { writeFileSync, createReadStream } = require('fs');
const googleTTS = require('google-tts-api');  // Nouveau package pour la génération audio
const { sendMessage } = require('../handles/sendMessage');
const fs = require('fs');
const form = require('form-data');

const token = fs.readFileSync('token.txt', 'utf8');

// Préférences des utilisateurs (mode fille ou garçon)
const userPreferences = {};

const prompts = {
  intelligence: `Imagine que tu es une intelligence artificielle avancée. Réponds aux questions de manière rapide, claire et précise.`,
};

module.exports = {
  name: 'gpt4',
  description: 'Discuter avec une intelligence artificielle avancée',
  author: 'Tata',
  usage: 'gpt4 [ta question]',

  async execute(senderId, args) {
    const pageAccessToken = token;
    const input = (args.join(' ') || 'bonjour').trim();

    // Définir le mode utilisateur (intelligence par défaut)
    const mode = 'intelligence';
    const characterPrompt = prompts[mode];
    const modifiedPrompt = `${input}, direct answer.`;

    try {
      // Message d'attente
      await sendMessage(senderId, { text: '💬 L\'IA est en train de te répondre ⏳...\n\n─────★─────' }, pageAccessToken);

      // Appels des APIs avec fallback en cas d’échec
      let messageText;
      try {
        // Première API
        messageText = await callPrimaryAPI(`${characterPrompt} ${modifiedPrompt}`, senderId);
        if (!messageText) throw new Error('Première API échouée');
      } catch {
        try {
          // Deuxième API
          messageText = await callSecondaryAPI(modifiedPrompt, senderId);
          if (!messageText) throw new Error('Deuxième API échouée');
        } catch {
          // Troisième API
          messageText = await callTertiaryAPI(modifiedPrompt, senderId);
          if (!messageText) throw new Error('Troisième API échouée');
        }
      }

      // Encadrer le message comme demandé
      const formattedResponse = formatResponse(messageText);
      await sendMessage(senderId, { text: formattedResponse }, pageAccessToken);

      // Envoyer la réponse en audio
      await sendAudioResponse(formattedResponse, senderId, pageAccessToken);

    } catch (error) {
      console.error('Erreur:', error);
      await sendMessage(senderId, { text: 'Désolé, une erreur est survenue.' }, pageAccessToken);
    }
  },

  setUserMode(senderId, mode) {
    userPreferences[senderId] = mode;
  }
};

// Fonction pour appeler l'API primaire
async function callPrimaryAPI(prompt, senderId) {
  const apiUrl = `https://ccprojectapis.ddns.net/api/gpt4turbo?q=${encodeURIComponent(prompt)}&id=${senderId}`;
  const response = await axios.get(apiUrl);
  return response.data?.response || "";
}

// Fonction pour appeler l'API secondaire
async function callSecondaryAPI(prompt, senderId) {
  const apiUrl = `https://joshweb.click/api/gpt-4o?q=${encodeURIComponent(prompt)}&uid=${senderId}`;
  const response = await axios.get(apiUrl);
  return response.data?.result || "";
}

// Fonction pour appeler l'API tertiaire
async function callTertiaryAPI(prompt, senderId) {
  const apiUrl = `https://api.kenliejugarap.com/blackbox?text=${encodeURIComponent(prompt)}`;
  const response = await axios.get(apiUrl);
  return response.data?.response || "";
}

// Fonction pour formater la réponse avec un style et un contour
function formatResponse(text) {
  return `─────★─────\n✨ IA 🤖\n\n${text}\n─────★─────`;
}

// Fonction pour découper les messages en morceaux de 2000 caractères
function splitMessageIntoChunks(message, chunkSize) {
  const chunks = [];
  for (let i = 0; i < message.length; i += chunkSize) {
    chunks.push(message.slice(i, i + chunkSize));
  }
  return chunks;
}

// Fonction pour gérer les messages longs de plus de 2000 caractères
async function handleLongResponse(response, senderId, pageAccessToken, sendMessage) {
  const maxMessageLength = 2000;
  if (response.length > maxMessageLength) {
    const messages = splitMessageIntoChunks(response, maxMessageLength);
    for (const message of messages) {
      await sendMessage(senderId, { text: message }, pageAccessToken);
    }
  } else {
    await sendMessage(senderId, { text: response }, pageAccessToken);
  }
}

// Fonction pour envoyer une réponse audio
async function sendAudioResponse(text, senderId, pageAccessToken) {
  try {
    const url = googleTTS.getAudioUrl(text, { lang: 'fr', slow: false });
    const audioData = await axios.get(url, { responseType: 'arraybuffer' });

    writeFileSync('audio.mp3', audioData.data);

    const audioFile = createReadStream('audio.mp3');
    const formData = new form();
    formData.append('recipient', JSON.stringify({ id: senderId }));
    formData.append('message', JSON.stringify({
      attachment: {
        type: 'audio',
        payload: {},
      }
    }));
    formData.append('filedata', audioFile);

    await axios.post(`https://graph.facebook.com/v17.0/me/messages?access_token=${pageAccessToken}`, formData, {
      headers: formData.getHeaders(),
    });
  } catch (error) {
    console.error('Erreur lors de la génération de l\'audio:', error);
  }
}
