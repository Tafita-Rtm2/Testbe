const { speak } = require('google-translate-api-x');
const { writeFileSync, createReadStream } = require('fs');
const axios = require('axios');
const form = require('form-data');
const fs = require('fs');

const token = fs.readFileSync('token.txt', 'utf8');

module.exports = {
  name: 'gpt4',
  description: 'Assistant IA',
  author: 'Tata',

  async execute(senderId, args, sendMessage) {
    const pageAccessToken = token;
    const prompt = args.join(' ') || 'Bonjour, comment puis-je vous aider ?';

    // Message d'attente
    await sendMessage(senderId, { text: '💬 L\'assistant est en train de te répondre ⏳...\n\n─────★─────' }, pageAccessToken);

    try {
      // Appel de la première API
      let response = await callPrimaryAPI(prompt, senderId);

      // Si la réponse est vide, on passe à la deuxième API
      if (!response || response.trim() === '') {
        console.log("Première API a échoué ou a renvoyé une réponse vide, passage à la deuxième API.");
        response = await callSecondaryAPI(prompt, senderId);
      }

      // Si la deuxième API est aussi vide, on passe à la troisième API
      if (!response || response.trim() === '') {
        console.log("Deuxième API a échoué ou a renvoyé une réponse vide, passage à la troisième API.");
        response = await callTertiaryAPI(prompt, senderId);
      }

      // Si toutes les APIs échouent, envoyer un message d'erreur par défaut
      if (!response || response.trim() === '') {
        throw new Error("Toutes les APIs ont échoué ou ont renvoyé une réponse vide.");
      }

      // Formatage et envoi de la réponse
      const formattedResponse = formatResponse(response);
      await handleLongResponse(formattedResponse, senderId, pageAccessToken, sendMessage);

      // Convertir la réponse en audio et l'envoyer
      await sendAudioResponse(response, senderId, pageAccessToken);

    } catch (error) {
      console.error('Erreur avec les API ou réponse vide:', error);
      await sendMessage(senderId, { text: 'Désolé, je n\'ai pas pu obtenir de réponse pour cette question.' }, pageAccessToken);
    }
  }
};

// Fonction pour appeler la première API
async function callPrimaryAPI(prompt, senderId) {
  const apiUrl = `https://ccprojectapis.ddns.net/api/gpt4turbo?q=${encodeURIComponent(prompt)}&id=${senderId}`;
  const response = await axios.get(apiUrl);
  return response.data?.response || "";
}

// Fonction pour appeler la deuxième API
async function callSecondaryAPI(prompt, senderId) {
  const apiUrl = `https://joshweb.click/api/gpt-4o?q=${encodeURIComponent(prompt)}&uid=${senderId}`;
  const response = await axios.get(apiUrl);
  return response.data?.result || "";
}

// Fonction pour appeler la troisième API
async function callTertiaryAPI(prompt, senderId) {
  const apiUrl = `https://api.kenliejugarap.com/blackbox?text=${encodeURIComponent(prompt)}`;
  const response = await axios.get(apiUrl);
  return response.data?.response || "";
}

// Fonction pour formater la réponse avec un style et un contour
function formatResponse(text) {
  return `─────★─────\n✨ Assistant IA 🤖\n\n${text}\n─────★─────`;
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

// Fonction pour convertir la réponse en audio et l'envoyer
async function sendAudioResponse(text, senderId, pageAccessToken) {
  try {
    const res = await speak(text, { to: 'fr' }); // Langue de conversion à ajuster selon les besoins

    // Enregistrer le fichier audio en MP3
    const audioFileName = 'audio.mp3';
    writeFileSync(audioFileName, res, { encoding: 'base64' });

    // Créer un stream pour l'audio
    const audioData = createReadStream(audioFileName);

    // Créer le formulaire pour envoyer l'audio via Messenger
    const formData = new form();
    formData.append('recipient', JSON.stringify({ id: senderId }));
    formData.append('message', JSON.stringify({
      attachment: {
        type: 'audio',
        payload: {},
      }
    }));
    formData.append('filedata', audioData);

    // Faire la requête POST pour envoyer l'audio via Messenger
    await axios.post(`https://graph.facebook.com/v17.0/me/messages?access_token=${pageAccessToken}`, formData, {
      headers: {
        ...formData.getHeaders(),
      }
    });
  } catch (error) {
    console.error('Erreur lors de la génération de l\'audio:', error);
  }
}
