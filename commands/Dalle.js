const axios = require('axios');

module.exports = {
  name: 'gmage',
  description: 'Search and send images from Google',
  usage: 'gmage [search query]',
  author: 'Cruizex',

  async execute(senderId, args, pageAccessToken, sendMessage) {
    if (args.length === 0) {
      return sendMessage(senderId, { text: '📷 Utilisez le format : gmage [mot-clé pour la recherche]' }, pageAccessToken);
    }

    const searchQuery = args.join(' ');
    const apiKey = 'AIzaSyC_gYM4M6Fp1AOYra_K_-USs0SgrFI08V0';
    const searchEngineID = 'e01c6428089ea4702';

    try {
      // Envoi d'un message pour indiquer que la recherche est en cours
      sendMessage(senderId, { text: '📷 Recherche de vos images en cours... 🔍' }, pageAccessToken);

      // Requête pour rechercher des images sur Google
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: apiKey,
          cx: searchEngineID,
          q: searchQuery,
          searchType: 'image',
        },
      });

      // Limite le nombre d'images renvoyées à 5
      const images = response.data.items.slice(0, 5);

      if (images.length > 0) {
        const attachments = images.map(image => ({
          type: 'image',
          payload: { url: image.link, is_reusable: true },
        }));

        // Envoi des images en tant que pièces jointes
        sendMessage(senderId, {
          attachment: attachments.length === 1 ? attachments[0] : { type: 'template', payload: { template_type: 'media', elements: attachments } },
        }, pageAccessToken);
      } else {
        sendMessage(senderId, { text: '📷 Aucune image trouvée pour cette recherche.' }, pageAccessToken);
      }
    } catch (error) {
      console.error('Erreur lors de la recherche d\'images :', error);
      sendMessage(senderId, { text: 'Désolé, une erreur est survenue lors de la recherche d\'images.' }, pageAccessToken);
    }
  },
};
