const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'yout',
  description: 'Search and send a YouTube video directly.',
  usage: 'youtube_video [video URL]',
  author: 'coffee',

  async execute(senderId, args, pageAccessToken) {
    try {
      // Vérifier si une URL YouTube est fournie
      const videoUrl = args[0];
      if (!videoUrl) {
        return sendMessage(senderId, { text: "Veuillez entrer un lien YouTube valide." }, pageAccessToken);
      }

      // Envoi d'un message pour indiquer que le téléchargement est en cours
      await sendMessage(senderId, { text: '🎥 Téléchargement de la vidéo en cours... ⏳' }, pageAccessToken);

      // Appeler l'API pour obtenir le lien de téléchargement direct
      const apiUrl = `https://apiv2.kenliejugarap.com/video?url=${encodeURIComponent(videoUrl)}`;
      const { data } = await axios.get(apiUrl);

      // Vérifier si un lien de téléchargement est disponible
      const downloadLink = data?.result?.download_url;
      if (!downloadLink) {
        return sendMessage(senderId, { text: 'Désolé, impossible de récupérer la vidéo pour cette URL.' }, pageAccessToken);
      }

      // Envoyer la vidéo directement dans le message
      await sendMessage(senderId, {
        attachment: {
          type: 'video',
          payload: { url: downloadLink, is_reusable: true }
        }
      }, pageAccessToken);

    } catch (error) {
      console.error('Erreur:', error);
      await sendMessage(senderId, { text: 'Désolé, une erreur est survenue lors du traitement de votre demande.' }, pageAccessToken);
    }
  }
};
