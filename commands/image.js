const axios = require('axios');

module.exports = {
  name: 'black',
  description: 'Interacts with the Blackbox Conversational AI.',
  author: 'Coffee',
  
  async execute(senderId, args, pageAccessToken, sendMessage) {
    const query = args.join(' ') || 'hello'; // Utilise la saisie de l'utilisateur ou le défaut "hello"
    
    // Envoyer un message indiquant que Blackbox est en train de répondre
    await sendMessage(senderId, { text: '🗃 | 𝙱𝚕𝚊𝚌𝚔𝚋𝚘𝚡 est en train de répondre...⏳' }, pageAccessToken);

    try {
      // Appel de l'API
      const response = await callBlackboxAPI(query);
      const formattedResponse = formatResponse(response);

      // Vérifie et envoie la réponse, même pour les longs messages
      await handleLongResponse(formattedResponse, senderId, pageAccessToken, sendMessage);

    } catch (error) {
      console.error("Erreur avec l'API Blackbox :", error);
      await sendMessage(senderId, { text: 'Une erreur est survenue lors de la connexion avec Blackbox. Veuillez réessayer plus tard.' }, pageAccessToken);
    }
  }
};

// Fonction pour appeler l'API Blackbox
async function callBlackboxAPI(query) {
  const apiUrl = `https://openapi-idk8.onrender.com/blackbox?chat=${encodeURIComponent(query)}`;
  const response = await axios.get(apiUrl);
  return response.data?.response || "Aucune réponse obtenue de l'API.";
}

// Fonction pour formater la réponse avec un style et un contour
function formatResponse(text) {
  return `🗃 | 𝙱𝚕𝚊𝚌𝚔 𝙱𝚘𝚡 |\n━━━━━━━━━━━━━━━━\n${text}\n━━━━━━━━━━━━━━━━`;
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
