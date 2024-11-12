const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'spotify',
  description: 'search and play spotify song.',
  usage: 'spotify [song name]',
  author: 'coffee',

  async execute(senderId, args, pageAccessToken) {
    try {
      // Envoi d'un message rapide pour indiquer que la recherche est en cours
      sendMessage(senderId, { text: '🎶 Recherche de votre chanson en cours... 🔍' }, pageAccessToken);

      // Effectuer la recherche de la chanson
      const { data } = await axios.get(`https://hiroshi-api.onrender.com/tiktok/spotify?search=${encodeURIComponent(args.join(' '))}`);
      const link = data[0]?.download;

      // Envoi de la chanson ou d'un message d'erreur si aucun lien n'a été trouvé
      sendMessage(senderId, link ? {
        attachment: { type: 'audio', payload: { url: link, is_reusable: true } }
      } : { text: 'Désolé, aucun lien Spotify trouvé pour cette recherche.' }, pageAccessToken);
    } catch {
      // Envoi d'un message d'erreur en cas de problème
      sendMessage(senderId, { text: 'Désolé, une erreur est survenue lors du traitement de votre demande.' }, pageAccessToken);
    }
  }
};
