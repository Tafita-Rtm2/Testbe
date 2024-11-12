const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');
const fs = require('fs');

// Lecture du token d'accès pour l'envoi des messages
const token = fs.readFileSync('token.txt', 'utf8');

module.exports = {
  name: 'flux',
  description: 'Generate an AI-based image with a custom prompt and options',
  author: 'Samir Œ',
  usage: 'flux <prompt> --ar 1:1 --model 2',

  async execute(senderId, args) {
    const pageAccessToken = token;
    let prompt = args.join(" ");
    let aspectRatio = "1:1";
    let model = "2";

    // Analyser les arguments pour récupérer les options d'aspect ratio et modèle
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--ar" && args[i + 1]) {
        aspectRatio = args[i + 1];
      }
      if (args[i] === "--model" && args[i + 1]) {
        model = args[i + 1];
      }
    }

    if (!prompt) {
      return await sendMessage(senderId, { text: 'Please provide a prompt for the image generator.' }, pageAccessToken);
    }

    await sendMessage(senderId, { text: '🧑‍🎨 Generating your image, please wait...' }, pageAccessToken);

    // Définir la liste des URLs d'API pour basculer en cas d'échec
    const apiUrls = [
      'https://samirxpikachuio.onrender.com/fluxfl',
      'https://www.samirxpikachu.run.place/fluxfl',
      'http://samirxzy.onrender.com/fluxfl'
    ];

    for (const baseUrl of apiUrls) {
      try {
        const apiUrl = `${baseUrl}?prompt=${encodeURIComponent(prompt)}&ratio=${aspectRatio}&model=${model}`;
        const response = await axios.get(apiUrl, { responseType: 'stream' });

        if (response.data) {
          await sendMessage(senderId, {
            attachment: { type: 'image', payload: { stream: response.data } }
          }, pageAccessToken);
          return;
        }
      } catch (error) {
        console.error(`Error with API ${baseUrl}:`, error);
      }
    }

    await sendMessage(senderId, { text: "All APIs failed. Please try again later or join https://t.me/Architectdevs for support." }, pageAccessToken);
  }
};
