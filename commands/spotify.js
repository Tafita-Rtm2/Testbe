const axios = require('axios');
const { speak } = require('google-translate-api-x');
const { writeFileSync, createReadStream } = require('fs');
const form = require('form-data');
const fs = require('fs');

const token = fs.readFileSync('token.txt', 'utf8');

module.exports = {
  name: 'gpt4o',
  description: 'Ask a question to GPT-4o',
  author: 'Deku & coffee (cascade API with three attempts)',

  async execute(senderId, args, pageAccessToken, sendMessage) {
    const prompt = args.join(' ');

    if (!prompt) {
      return sendMessage(senderId, { text: "Veuillez entrer une question valide." }, pageAccessToken);
    }

    // Envoyer un message indiquant que GPT-4o est en train de répondre
    await sendMessage(senderId, { text: '💬 GPT-4o est en train de te répondre ⏳...\n\n─────★─────' }, pageAccessToken);

    try {
      // Tentative avec la première API
      const response = await callPrimaryAPI1(prompt, senderId);

      // Si la réponse est vide ou nulle, passer à la deuxième API
      if (!response || response.trim() === '') {
        console.log("Première API a échoué ou a renvoyé une réponse vide, passage à la deuxième API.");
        throw new Error("Première API a échoué ou a renvoyé une réponse vide.");
      }

      const formattedResponse = formatResponse(response);
      await handleLongResponse(formattedResponse, senderId, pageAccessToken, sendMessage);
      await sendAudioResponse(formattedResponse, senderId, pageAccessToken);

    } catch (error) {
      console.error('Erreur avec la première API ou réponse vide:', error);

      // Tentative avec la deuxième API
      try {
        const response = await callPrimaryAPI2(prompt, senderId);

        if (!response || response.trim() === '') {
          console.log("Deuxième API a échoué ou a renvoyé une réponse vide, passage à la troisième API.");
          throw new Error("Deuxième API a échoué ou a renvoyé une réponse vide.");
        }

        const formattedResponse = formatResponse(response);
        await handleLongResponse(formattedResponse, senderId, pageAccessToken, sendMessage);
        await sendAudioResponse(formattedResponse, senderId, pageAccessToken);

      } catch (error) {
        console.error('Erreur avec la deuxième API ou réponse vide:', error);

        // Tentative avec la troisième API
        try {
          const response = await callPrimaryAPI3(prompt, senderId);

          if (!response || response.trim() === '') {
            throw new Error("Troisième API a échoué ou a renvoyé une réponse vide.");
          }

          const formattedResponse = formatResponse(response);
          await handleLongResponse(formattedResponse, senderId, pageAccessToken, sendMessage);
          await sendAudioResponse(formattedResponse, senderId, pageAccessToken);

        } catch (error) {
          console.error('Erreur avec la troisième API ou réponse vide:', error);
          await sendMessage(senderId, { text: 'Désolé, je n\'ai pas pu obtenir de réponse pour cette question.' }, pageAccessToken);
        }
      }
    }
  }
};

// Fonction pour appeler la première API (du premier code)
async function callPrimaryAPI1(prompt, senderId) {
  const apiUrl = `https://ccprojectapis.ddns.net/api/gpt4turbo?q=${encodeURIComponent(prompt)}&id=${senderId}`;
  const response = await axios.get(apiUrl);
  return response.data?.response || "";
}

// Fonction pour appeler la deuxième API (première API du deuxième code)
async function callPrimaryAPI2(prompt, senderId) {
  const apiUrl = `https://joshweb.click/api/gpt-4o?q=${encodeURIComponent(prompt)}&uid=${senderId}`;
  const response = await axios.get(apiUrl);
  return response.data?.result || "";
}

// Fonction pour appeler la troisième API (deuxième API du deuxième code)
async function callPrimaryAPI3(prompt, senderId) {
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

// Fonction pour envoyer la réponse sous forme audio unique
async function sendAudioResponse(response, senderId, pageAccessToken) {
  try {
    // Convertir la réponse entière en audio
    const res = await speak(response, { to: 'fr' });

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
    console.error("Erreur lors de la conversion ou de l'envoi de l'audio :", error);
  }
}
