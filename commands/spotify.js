const axios = require('axios');
const { speak } = require('google-translate-api-x');
const { writeFileSync, createReadStream } = require('fs');
const form = require('form-data');

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
      // Appel de la première API (nouvelle API ajoutée)
      const response = await callNewPrimaryAPI(prompt, senderId);

      if (!response || response.trim() === '') {
        console.log("Nouvelle API primaire a échoué ou a renvoyé une réponse vide, passage à la deuxième API.");
        throw new Error("Nouvelle API primaire a échoué ou a renvoyé une réponse vide.");
      }

      const formattedResponse = formatResponse(response);
      await handleLongResponse(formattedResponse, senderId, pageAccessToken, sendMessage);
      await convertAndSendAudio(formattedResponse, senderId, pageAccessToken);

    } catch (error) {
      console.error('Erreur avec la nouvelle API primaire ou réponse vide:', error);

      try {
        const fallbackResponse = await callPrimaryAPI(prompt, senderId);

        if (!fallbackResponse || fallbackResponse.trim() === '') {
          console.log("Deuxième API a échoué ou a renvoyé une réponse vide, passage à la troisième API.");
          throw new Error("Deuxième API a échoué ou a renvoyé une réponse vide.");
        }

        const formattedFallbackResponse = formatResponse(fallbackResponse);
        await handleLongResponse(formattedFallbackResponse, senderId, pageAccessToken, sendMessage);
        await convertAndSendAudio(formattedFallbackResponse, senderId, pageAccessToken);

      } catch (secondaryError) {
        console.error('Erreur avec la deuxième API ou réponse vide:', secondaryError);

        try {
          const finalFallbackResponse = await callSecondaryAPI(prompt, senderId);

          if (!finalFallbackResponse || finalFallbackResponse.trim() === '') {
            throw new Error("Troisième API a échoué ou a renvoyé une réponse vide.");
          }

          const formattedFinalFallbackResponse = formatResponse(finalFallbackResponse);
          await handleLongResponse(formattedFinalFallbackResponse, senderId, pageAccessToken, sendMessage);
          await convertAndSendAudio(formattedFinalFallbackResponse, senderId, pageAccessToken);

        } catch (finalError) {
          console.error('Erreur avec la troisième API ou réponse vide:', finalError);
          await sendMessage(senderId, { text: 'Désolé, je n\'ai pas pu obtenir de réponse pour cette question.' }, pageAccessToken);
        }
      }
    }
  }
};

// Fonction pour appeler la nouvelle API primaire
async function callNewPrimaryAPI(prompt, senderId) {
  const apiUrl = `https://ccprojectapis.ddns.net/api/gpt4turbo?q=${encodeURIComponent(prompt)}&id=${senderId}`;
  const response = await axios.get(apiUrl);
  return response.data?.response || "";
}

// Fonction pour appeler l'API primaire (ancienne première API, maintenant deuxième)
async function callPrimaryAPI(prompt, senderId) {
  const apiUrl = `https://joshweb.click/api/gpt-4o?q=${encodeURIComponent(prompt)}&uid=${senderId}`;
  const response = await axios.get(apiUrl);
  return response.data?.result || "";
}

// Fonction pour appeler l'API secondaire (ancienne deuxième API, maintenant troisième)
async function callSecondaryAPI(prompt, senderId) {
  const apiUrl = `https://api.kenliejugarap.com/blackbox?text=${encodeURIComponent(prompt)}`;
  const response = await axios.get(apiUrl);
  return response.data?.response || "";
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

// Fonction pour convertir le texte en audio et l'envoyer
async function convertAndSendAudio(text, senderId, pageAccessToken) {
  try {
    // Conversion du texte en audio
    const audioData = await speak(text, { to: 'fr' }); // Langue : français

    // Enregistrement du fichier audio en MP3
    const audioFileName = 'audio.mp3';
    writeFileSync(audioFileName, audioData, { encoding: 'base64' });

    // Création d'un stream pour l'audio
    const audioStream = createReadStream(audioFileName);

    // Création du formulaire pour envoyer l'audio via Messenger
    const formData = new form();
    formData.append('recipient', JSON.stringify({ id: senderId }));
    formData.append('message', JSON.stringify({
      attachment: {
        type: 'audio',
        payload: {},
      }
    }));
    formData.append('filedata', audioStream);

    // Faire la requête POST pour envoyer l'audio via Messenger
    await axios.post(`https://graph.facebook.com/v17.0/me/messages?access_token=${pageAccessToken}`, formData, {
      headers: {
        ...formData.getHeaders(),
      }
    });

  } catch (error) {
    console.error("Erreur lors de la conversion ou de l'envoi de l'audio:", error);
  }
}
