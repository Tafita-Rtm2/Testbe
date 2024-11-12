const axios = require('axios');

module.exports = {
  name: 'gpt4o',
  description: 'Ask a question to GPT-4o',
  author: 'Deku & coffee (fallback API)',
  
  async execute(senderId, args, pageAccessToken, sendMessage) {
    const prompt = args.join(' ');

    if (!prompt) {
      return sendMessage(senderId, { text: "Veuillez entrer une question valide." }, pageAccessToken);
    }

    // Envoyer un message indiquant que GPT-4o est en train de répondre
    await sendMessage(senderId, { text: '💬 GPT-4o est en train de te répondre ⏳...\n\n─────★─────' }, pageAccessToken);

    try {
      // Appel de la première API
      const response = await callPrimaryAPI(prompt, senderId);
      const formattedResponse = formatResponse(response);

      // Vérifier et envoyer la réponse, même pour les longs messages
      await handleLongResponse(formattedResponse, senderId, pageAccessToken, sendMessage);

    } catch (error) {
      console.error('Erreur avec l\'API primaire GPT-4o:', error);
      
      // Tentative avec la deuxième API en cas d'erreur
      try {
        const fallbackResponse = await callSecondaryAPI(prompt, senderId);
        const formattedFallbackResponse = formatResponse(fallbackResponse);
        
        await handleLongResponse(formattedFallbackResponse, senderId, pageAccessToken, sendMessage);
        
      } catch (fallbackError) {
        console.error('Erreur avec l\'API secondaire GPT-4o:', fallbackError);
        await sendMessage(senderId, { text: 'Désolé, une erreur est survenue avec les deux API. Veuillez réessayer plus tard.' }, pageAccessToken);
      }
    }
  }
};

// Fonction pour appeler l'API primaire avec gestion des réponses manquantes
async function callPrimaryAPI(prompt, senderId) {
  const apiUrl = `https://joshweb.click/api/gpt-4o?q=Tu_es_une_intelligence_artificielle_plus_avancee_GPT-4o_capable_de_faire_des_recherches_sur_internet_et_repondre_a_toutes_les_questions_tu_es_capable_de_tout_faire_${encodeURIComponent(prompt)}&uid=${senderId}`;
  const response = await axios.get(apiUrl);
  return response.data?.result || "Aucune réponse obtenue de l'API primaire.";
}

// Fonction pour appeler l'API secondaire avec gestion des réponses manquantes
async function callSecondaryAPI(prompt, senderId) {
  const apiUrl = `https://joshweb.click/api/gpt-4o?q=${encodeURIComponent(prompt)}&uid=${senderId}`;
  const response = await axios.get(apiUrl);
  return response.data?.result || "Aucune réponse obtenue de l'API secondaire.";
}

// Fonction pour formater la réponse avec un style et un contour
function formatResponse(text) {
  return `─────★─────\n✨ GPT-4o 🤖\n\n${text}\n─────★─────`;
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
