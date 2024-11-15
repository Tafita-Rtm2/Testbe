const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { sendMessage } = require('./sendMessage');

const commands = new Map();
const userStates = new Map(); // Suivi des états des utilisateurs
const userSubscriptions = new Map(); // Enregistre les abonnements utilisateurs avec une date d'expiration
const userFreeQuestions = new Map(); // Enregistre le nombre de questions gratuites par utilisateur par jour
const validCodes = ["2201", "1206", "0612", "1212", "2003"];
const subscriptionDuration = 30 * 24 * 60 * 60 * 1000; // Durée de l'abonnement : 30 jours en millisecondes
const subscriptionCost = 3000; // Coût de l'abonnement : 3000 AR

// Charger les commandes
const commandFiles = fs.readdirSync(path.join(__dirname, '../commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`../commands/${file}`);
  commands.set(command.name, command);
}

// Fonction principale pour gérer les messages entrants
async function handleMessage(event, pageAccessToken) {
  const senderId = event.sender.id;

  if (event.message.attachments && event.message.attachments[0].type === 'image') {
    // Gérer les images
    const imageUrl = event.message.attachments[0].payload.url;
    await askForImagePrompt(senderId, imageUrl, pageAccessToken);
  } else if (event.message.text) {
    const messageText = event.message.text.trim().toLowerCase();
    const args = messageText.split(' ');
    const commandName = args.shift().toLowerCase();

    // Vérifier si l'utilisateur est dans un mode verrouillé
    if (userStates.has(senderId) && userStates.get(senderId).lockedCommand) {
      const lockedCommand = userStates.get(senderId).lockedCommand;

      // Gérer les commandes spéciales pour quitter le verrouillage
      if (messageText === 'stop') {
        userStates.delete(senderId); // Sortir du mode verrouillé
        await sendMessage(senderId, { text: "🚫 Vous avez quitté le mode verrouillé." }, pageAccessToken);
        return;
      } else {
        // Rediriger toutes les entrées vers la commande verrouillée
        const command = commands.get(lockedCommand);
        if (command) {
          await command.execute(senderId, [messageText], pageAccessToken, sendMessage);
        } else {
          await sendMessage(senderId, { text: `❌ La commande '${lockedCommand}' n'existe plus.` }, pageAccessToken);
        }
        return;
      }
    }

    // Vérifier si l'utilisateur est dans un état d'analyse d'image
    if (userStates.has(senderId)) {
      const userState = userStates.get(senderId);

      if (userState.awaitingImagePrompt || userState.lockedImage) {
        // Commandes spéciales pour le mode image
        if (messageText === 'stop') {
          userStates.delete(senderId); // Quitter le mode image
          await sendMessage(senderId, { text: "🚫 Vous avez quitté le mode image." }, pageAccessToken);
          return;
        } else if (messageText === 'help') {
          await sendMessage(senderId, { text: "ℹ️ Voici de l'aide pour le mode image :\n- Entrez une description pour analyser l'image.\n- Tapez 'stop' pour quitter le mode image." }, pageAccessToken);
          return;
        }
      }

      if (userState.awaitingImagePrompt) {
        // Utiliser le prompt de l'utilisateur pour analyser l'image
        const imageUrl = userState.imageUrl;
        userState.lockedImage = true; // Verrouiller l'image pour les questions suivantes
        userState.prompt = messageText; // Stocker le prompt initial
        await analyzeImageWithPrompt(senderId, imageUrl, messageText, pageAccessToken);
        return;
      } else if (userState.lockedImage) {
        // Poser une question supplémentaire sur l'image verrouillée
        const imageUrl = userState.imageUrl;
        const prompt = messageText;
        await analyzeImageWithPrompt(senderId, imageUrl, prompt, pageAccessToken);
        return;
      }
    }

    // Gérer les commandes textuelles
    const command = commands.get(commandName);
    if (command) {
      userStates.set(senderId, { lockedCommand: commandName }); // Verrouiller sur la commande
      await sendMessage(senderId, { text: `🔒 Vous êtes maintenant verrouillé sur la commande '${commandName}'. Tapez 'stop' pour quitter.` }, pageAccessToken);
      await command.execute(senderId, args, pageAccessToken, sendMessage);
    } else {
      // Si aucune commande n'est reconnue
      await sendMessage(senderId, { text: "❓ Je n'ai pas compris votre demande. Tapez 'help' pour de l'aide." }, pageAccessToken);
    }
  }
}

// Les autres fonctions restent inchangées (voir la version précédente).

module.exports = { handleMessage };
