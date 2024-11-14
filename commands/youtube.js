const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'ytb',
  description: 'Search and send a YouTube video link.',
  usage: 'youtube [video name]',
  author: 'coffee',

  async execute(senderId, args, pageAccessToken) {
    try {
      // Envoyer un message pour indiquer que la recherche est en cours
      await sendMessage(senderId, { text: '🎥 Recherche de la vidéo sur YouTube... 🔍' }, pageAccessToken);

      // Effectuer une recherche via l'API YouTube pour obtenir le lien de la vidéo
      const query = encodeURIComponent(args.join(' '));
      const apiKey = 'AIzaSyAAWHCim0MH-d6pILuwoUj7RyUv3hl2rzI';
      const { data } = await axios.get(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${query}&key=${apiKey}`);
      
      // Vérifier si des résultats ont été trouvés
      const videoId = data.items[0]?.id?.videoId;
      if (!videoId) {
        return sendMessage(senderId, { text: 'Désolé, aucune vidéo trouvée pour cette recherche.' }, pageAccessToken);
      }

      // Créer le lien de la vidéo YouTube
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Envoyer le lien de la vidéo à Messenger
      await sendMessage(senderId, { text: `Voici votre vidéo : ${videoUrl}` }, pageAccessToken);
    } catch (error) {
      console.error('Erreur:', error);
      await sendMessage(senderId, { text: 'Désolé, une erreur est survenue lors du traitement de votre demande.' }, pageAccessToken);
    }
  }
};
