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

// Si la réponse est vide ou nulle, passer à la deuxième API

if (!response || response.trim() === '') {

console.log("Première API a échoué ou a renvoyé une réponse vide, passage à la deuxième API.");

throw new Error("Première API a échoué ou a renvoyé une réponse vide.");

}

const formattedResponse = formatResponse(response);

await handleLongResponse(formattedResponse, senderId, pageAccessToken, sendMessage);

} catch (error) {

console.error('Erreur avec l\'API primaire GPT-4o ou réponse vide:', error);

// Tentative avec la deuxième API en cas d'erreur ou de réponse vide de la première API

try {

const fallbackResponse = await callSecondaryAPI(prompt, senderId);

// Si la réponse de la deuxième API est vide, envoyer un message d'erreur par défaut

if (!fallbackResponse || fallbackResponse.trim() === '') {

throw new Error("Deuxième API a échoué ou a renvoyé une réponse vide.");

}

const formattedFallbackResponse = formatResponse(fallbackResponse);

await handleLongResponse(formattedFallbackResponse, senderId, pageAccessToken, sendMessage);

} catch (fallbackError) {

console.error('Erreur avec l\'API secondaire GPT-4o ou réponse vide:', fallbackError);

await sendMessage(senderId, { text: 'Désolé, je n\'ai pas pu obtenir de réponse pour cette question.' }, pageAccessToken);

}

}

}

};

// Fonction pour appeler l'API primaire

async function callPrimaryAPI(prompt, senderId) {

const apiUrl = `https://joshweb.click/api/gpt-4o?q=${encodeURIComponent(prompt)}&uid=${senderId}`;

const response = await axios.get(apiUrl);

return response.data?.result || "";

}

// Fonction pour appeler l'API secondaire

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
