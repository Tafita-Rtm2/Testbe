const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'youtube_search_send',
  description: 'Search for a YouTube video and send it.',
  usage: 'youtube_search_send [keywords]',
  author: 'coffee',

  async execute(senderId, args, pageAccessToken) {
    try {
      const query = args.join(' ');
      if (!query) {
        return sendMessage(senderId, { text: "Veuillez entrer des mots-clés pour rechercher une vidéo YouTube." }, pageAccessToken);
      }

      // Message indiquant que la recherche est en cours
      await sendMessage(senderId, { text: '🔍 Recherche de la vidéo en cours...' }, pageAccessToken);

      // Étape 1 : Rechercher la vidéo YouTube en utilisant une API de recherche YouTube
      const apiKey = 'AIzaSyAAWHCim0MH-d6pILuwoUj7RyUv3hl2rzI';
      const youtubeSearchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&key=${apiKey}`;
      const searchResponse = await axios.get(youtubeSearchUrl);
      const videoId = searchResponse.data.items[0]?.id?.videoId;

      if (!videoId) {
        return sendMessage(senderId, { text: "Aucune vidéo trouvée pour cette recherche." }, pageAccessToken);
      }

      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Message indiquant que le téléchargement est en cours
      await sendMessage(senderId, { text: '🎥 Téléchargement de la vidéo en cours... ⏳' }, pageAccessToken);

      // Étape 2 : Appeler l'API pour obtenir le lien de téléchargement
      const downloadApiUrl = `https://apiv2.kenliejugarap.com/video?url=${encodeURIComponent(videoUrl)}`;
      const { data: downloadData } = await axios.get(downloadApiUrl);
      const downloadLink = downloadData?.result?.download_url;

      if (!downloadLink) {
        return sendMessage(senderId, { text: 'Désolé, impossible de récupérer la vidéo pour cette URL.' }, pageAccessToken);
      }

      // Étape 3 : Envoyer la vidéo via Messenger
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
