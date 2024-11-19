const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Charger le Page Access Token depuis le fichier token.txt
const PAGE_ACCESS_TOKEN = fs.readFileSync(path.join(__dirname, '..', 'token.txt'), 'utf-8').trim();
const VERIFY_TOKEN = 'pagebot'; // Définissez votre VERIFY_TOKEN ici

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    // Vérification du webhook de Facebook
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook vérifié avec succès !');
      return res.status(200).send(challenge);
    } else {
      console.error('Échec de la vérification !');
      return res.status(403).send('Échec de la vérification.');
    }
  } else if (req.method === 'POST') {
    // Gestion des événements Messenger
    const body = req.body;

    if (body.object === 'page') {
      body.entry.forEach((entry) => {
        const webhookEvent = entry.messaging[0];
        console.log('Événement webhook reçu :', webhookEvent);

        // Vérifie si le message contient du texte
        if (webhookEvent.message) {
          const senderId = webhookEvent.sender.id;
          const messageText = webhookEvent.message.text;

          console.log(`Message reçu : "${messageText}" de ${senderId}`);

          // Envoie une réponse simple
          sendMessage(senderId, `Bonjour ! Vous avez dit : "${messageText}"`);
        }
      });

      // Répond à Facebook pour confirmer la réception
      return res.status(200).send('EVENT_RECEIVED');
    } else {
      return res.status(404).send('Pas trouvé.');
    }
  }
};

// Fonction pour envoyer un message via l'API Graph
function sendMessage(senderId, messageText) {
  const url = `https://graph.facebook.com/v12.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;

  const payload = {
    recipient: { id: senderId },
    message: { text: messageText },
  };

  axios
    .post(url, payload)
    .then(() => {
      console.log('Message envoyé :', messageText);
    })
    .catch((error) => {
      console.error('Erreur lors de l\'envoi du message :', error.response?.data || error.message);
    });
}
