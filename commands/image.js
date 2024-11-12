const axios = require('axios');

module.exports = {
  name: 'bing',
  description: 'Ask a question to the Bing Copilot',
  author: 'RN',
  
  async execute(senderId, args, pageAccessToken, sendMessage) {
    const id = senderId;
    const query = args.join(' ') || "Hello! How can I assist you today?"; // Default message if no input
    
    // Envoyer un message indiquant que Copilot est en train de répondre
    await sendMessage(senderId, { text: '🌊✨ | 𝙲𝚘𝚙𝚒𝚕𝚘𝚝 est en train de répondre...⏳' }, pageAccessToken);

    // Récupérer la réponse précédente pour cet utilisateur (suivi de conversation)
    const previousResponse = previousResponses.get(id);
    let modifiedQuery = query;
    if (previousResponse) {
      modifiedQuery = `Follow-up on: "${previousResponse}"\nUser reply: "${query}"`;
    }

    try {
      // Appel de l'API avec la requête
      const response = await callBingAPI(modifiedQuery, id);
      const formattedResponse = formatResponse(response);

      // Envoie la réponse formatée (gestion des messages longs)
      await handleLongResponse(formattedResponse, senderId, pageAccessToken, sendMessage);

      // Stocker la réponse pour les suivis
      previousResponses.set(id, response);

    } catch (error) {
      console.error("Erreur avec l'API Copilot :", error);
      await sendMessage(senderId, { text: 'Désolé, une erreur est survenue lors de la connexion avec Copilot. Veuillez réessayer plus tard.' }, pageAccessToken);
    }
  }
};

// Map pour stocker les réponses précédentes de chaque utilisateur
const previousResponses = new Map();

// Fonction pour appeler l'API Bing Copilot
async function callBingAPI(query, id) {
  const apiUrl = `https://www.samirxpikachu.run.place/bing?message=${encodeURIComponent(query)}&mode=1&uid=${id}`;
  const response = await axios.get(apiUrl);
  return response.data || "Aucune réponse obtenue de l'API.";
}

// Fonction pour formater la réponse avec un style et un contour
function formatResponse(text) {
  return `🌊✨ | 𝙲𝚘𝚙𝚒𝚕𝚘𝚝\n━━━━━━━━━━━━━━━━\n${text}\n━━━━━━━━━━━━━━━━`;
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
