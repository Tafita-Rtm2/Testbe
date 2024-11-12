const axios = require("axios");

module.exports = {
  name: 'black',
  description: 'Blackbox AI assistant by Kenlie Navacilla Jugarap',
  author: 'KENLIEPLAYS',

  async execute(senderId, args, pageAccessToken, sendMessage) {
    const query = args.join(" ").toLowerCase() || "How can I help you?";
    const defaultResponse = "🗃 | 𝙱𝚕𝚊𝚌𝚔 𝙱𝚘𝚡 | \n━━━━━━━━━━━━━━━━\nHello! How can I help you?\n━━━━━━━━━━━━━━━━";

    if (query === "hello" || query === "hi") {
      return await sendMessage(senderId, { text: defaultResponse }, pageAccessToken);
    }

    // Envoyer un message indiquant que Blackbox est en train de répondre
    await sendMessage(senderId, { text: '🗃 | 𝙱𝚕𝚊𝚌𝚔 𝙱𝚘𝚡 |\nVeuillez patienter pendant la réponse...' }, pageAccessToken);

    try {
      const responseMessage = await getMessage(args.join(" "));
      const formattedResponse = formatResponse(responseMessage);

      // Envoyer la réponse formatée (gestion des messages longs)
      await handleLongResponse(formattedResponse, senderId, pageAccessToken, sendMessage);

    } catch (error) {
      console.error("Erreur avec l'API Blackbox :", error);
      await sendMessage(senderId, { text: 'Erreur : Une erreur est survenue lors de la connexion à Blackbox. Veuillez réessayer plus tard.' }, pageAccessToken);
    }
  }
};

// Fonction pour appeler l'API Blackbox
async function getMessage(yourMessage) {
  try {
    const res = await axios.get(`https://api.kenliejugarap.com/blackbox?text=${encodeURIComponent(yourMessage)}`);
    let response = res.data.response || "Aucune réponse de l'API.";
    
    // Supprimer la partie concernant le clic sur le lien
    response = response.replace(/\n\nIs this answer helpful to you\? Kindly click the link below\nhttps:\/\/click2donate\.kenliejugarap\.com\n\(Clicking the link and clicking any ads or button and wait for 30 seconds \(3 times\) everyday is a big donation and help to us to maintain the servers, last longer, and upgrade servers in the future\)/, '');
    
    return response;
  } catch (error) {
    console.error("Erreur lors de l'obtention du message :", error);
    throw error;
  }
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
