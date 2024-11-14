const { speak } = require('google-translate-api-x');
const { writeFileSync, createReadStream } = require('fs');
const { sendMessage } = require('../handles/sendMessage');
const axios = require('axios');
const form = require('form-data');
const fs = require('fs');

const token = fs.readFileSync('token.txt', 'utf8');

// Préférences des utilisateurs (mode fille ou garçon)
const userPreferences = {};

module.exports = {
  name: 'gpt4',
  description: 'Discuter avec GPT-4 sans prompt',
  author: 'Tata',
  usage: 'gpt4 [ta question]',

  async execute(senderId, args) {
    const pageAccessToken = token;
    const input = (args.join(' ') || 'hi').trim();
    const modifiedInput = `${input}, direct answer.`;

    try {
      // Message d'attente
      await sendMessage(senderId, { text: 'gpt4o turbo est en train d'ecrir...' }, pageAccessToken);

      // Requête API sans prompt personnalisé pour GPT-4
      const response = await axios.get(
        `https://ccprojectapis.ddns.net/api/gpt4turbo?q=${encodeURIComponent(modifiedInput)}&id=${senderId}`
      );
      const data = response.data;
      const messageText = data.response;

      // Envoyer le message texte
      await sendMessage(senderId, { text: messageText }, pageAccessToken);

      // Fonction pour diviser un texte en morceaux de 200 caractères maximum
      const splitText = (text, maxLength = 200) => {
        const result = [];
        for (let i = 0; i < text.length; i += maxLength) {
          result.push(text.slice(i, i + maxLength));
        }
        return result;
      };

      // Diviser le texte en morceaux si nécessaire
      const textChunks = splitText(messageText);

      // Convertir chaque morceau en audio et l'envoyer
      for (let chunk of textChunks) {
        const res = await speak(chunk, { to: 'fr' }); // Langue de conversion à ajuster selon les besoins

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
      }

    } catch (error) {
      console.error('Erreur:', error);
      await sendMessage(senderId, { text: 'Désolé, une erreur est survenue.' }, pageAccessToken);
    }
  },

  // Fonction pour définir le mode utilisateur
  setUserMode(senderId, mode) {
    userPreferences[senderId] = mode;
  }
};
