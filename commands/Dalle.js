const axios = require("axios");
const ytdl = require("ytdl-core");
const yts = require("yt-search");

module.exports = {
  name: "video",
  description: "Download a YouTube video",
  usage: "video [video name]",
  author: "AceGun",

  async execute({ api, event }) {
    const input = event.body.trim();
    const videoName = input.replace(/^video\s+/i, ''); // Enlève le préfixe "video"

    if (!videoName) {
      return api.sendMessage("Veuillez spécifier un nom de vidéo.", event.threadID);
    }

    try {
      api.sendMessage("⏳ Recherche de votre vidéo, veuillez patienter...", event.threadID);
      
      // Recherche de la vidéo sur YouTube
      const searchResults = await yts(videoName);
      if (!searchResults.videos.length) {
        return api.sendMessage("Aucune vidéo trouvée.", event.threadID);
      }

      const video = searchResults.videos[0];
      const videoUrl = video.url;
      const stream = ytdl(videoUrl, { filter: "audioandvideo" });
      const fileName = `${event.senderID}.mp4`;
      const filePath = `${__dirname}/cache/${fileName}`;

      // Téléchargement de la vidéo
      stream.pipe(require('fs').createWriteStream(filePath));
      stream.on('end', async () => {
        const fileSize = require('fs').statSync(filePath).size;
        if (fileSize > 26214400) { // Limite de 25 Mo
          require('fs').unlinkSync(filePath);
          return api.sendMessage('Le fichier est trop volumineux pour être envoyé (plus de 25 Mo).', event.threadID);
        }

        // Envoi de la vidéo
        await api.sendMessage({
          body: `🎥 Voici votre vidéo :\n\n🔹 Titre : ${video.title}\n⏰ Durée : ${video.duration.timestamp}`,
          attachment: require('fs').createReadStream(filePath),
        }, event.threadID, () => require('fs').unlinkSync(filePath));
      });
    } catch (error) {
      console.error('Erreur lors du traitement de la commande vidéo :', error);
      api.sendMessage("Une erreur est survenue lors du téléchargement de la vidéo.", event.threadID);
    }
  }
};
