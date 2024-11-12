const axios = require('axios'); 
const { sendMessage } = require('../handles/sendMessage');
const fs = require('fs');

// Lecture du token d'accès pour l'envoi des messages
const token = fs.readFileSync('token.txt', 'utf8');

module.exports = {
  name: 'image',
  description: 'Generate an AI-based image',
  author: 'vex_kshitiz',
  usage: 'imagine dog',

  async execute(senderId, args) {
    const pageAccessToken = token;
    const prompt = args.join(' ').trim();

    // Vérifie que l'utilisateur a bien entré une commande
    if (!prompt) {
      return await sendMessage(senderId, { text: 'Veuillez fournir une description pour générer l’image.' }, pageAccessToken);
    }

    try {
      // Message d'attente avec un style personnalisé et des emojis
      await sendMessage(senderId, { text: '🗻 Génération de l\'image en cours... ✨\n──────🌍───────' }, pageAccessToken);

      // Appel à l'API pour générer l'image
      const imageUrl = await generateImage(prompt);

      if (imageUrl) {
        await sendMessage(senderId, {
          attachment: { type: 'image', payload: { url: imageUrl } }
        }, pageAccessToken);
      } else {
        await sendMessage(senderId, { text: 'Échec de la génération de l\'image. Veuillez essayer une autre description.' }, pageAccessToken);
      }

    } catch (error) {
      console.error('Erreur:', error);
      await sendMessage(senderId, { text: 'Erreur : Une erreur inattendue est survenue lors de la génération de l\'image.' }, pageAccessToken);
    }
  }
};

// Fonction pour générer une image via l'API
async function generateImage(prompt) {
  try {
    // Remplace l'URL de l'API par la nouvelle URL et encode le prompt
    const { data } = await axios.get(`https://jerome-web.gleeze.com/service/api/bing?prompt=${encodeURIComponent(prompt)}`);
    return data.url;
  } catch (error) {
    throw new Error('Erreur lors de la génération de l’image');
  }
}
