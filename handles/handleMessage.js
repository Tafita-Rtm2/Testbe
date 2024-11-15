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

  // Vérifier si l'utilisateur est abonné
  const isSubscribed = checkSubscription(senderId);

  if (event.message.attachments && event.message.attachments[0].type === 'image') {
    const imageUrl = event.message.attachments[0].payload.url;
    await askForImagePrompt(senderId, imageUrl, pageAccessToken);
  } else if (event.message.text) {
    const messageText = event.message.text.trim();

    // Validation d'un code d'abonnement
    if (validCodes.includes(messageText)) {
      const expirationDate = Date.now() + subscriptionDuration;
      userSubscriptions.set(senderId, expirationDate);

      // Envoyer le message d'état avant d'exécuter d'autres actions
      await sendMessage(senderId, {
        text: `✅ Code validé ! Votre abonnement de 30 jours est maintenant actif jusqu'au ${new Date(expirationDate).toLocaleDateString()} !`
      }, pageAccessToken);

      // Exécution automatique de la commande "help"
      const helpCommand = commands.get('help');
      if (helpCommand) {
        return await helpCommand.execute(senderId, [], pageAccessToken, sendMessage);
      } else {
        return await sendMessage(senderId, { text: "❌ La commande 'help' n'est pas disponible." }, pageAccessToken);
      }
    }

    // Commande "stop" pour quitter le mode actuel
    if (messageText.toLowerCase() === 'stop') {
      userStates.delete(senderId);
      return await sendMessage(senderId, { text: "🔓 Vous avez quitté le mode actuel." }, pageAccessToken);
    }

    // Vérifier si l'utilisateur est en mode d'analyse d'image
    if (userStates.has(senderId) && userStates.get(senderId).awaitingImagePrompt) {
      const { imageUrl } = userStates.get(senderId);

      // Envoyer un message avant l'analyse
      await sendMessage(senderId, { text: "🔍 Analyse en cours, merci de patienter..." }, pageAccessToken);

      return await analyzeImageWithPrompt(senderId, imageUrl, messageText, pageAccessToken);
    }

    // Gestion des commandes
    const args = messageText.split(' ');
    const commandName = args[0].toLowerCase();
    const command = commands.get(commandName);

    if (command) {
      // Envoyer un message d'état avant d'exécuter une commande
      await sendMessage(senderId, { text: `🔒 Exécution de la commande '${commandName}'...` }, pageAccessToken);

      return await command.execute(senderId, args.slice(1), pageAccessToken, sendMessage);
    }

    // Gestion des commandes verrouillées
    if (userStates.has(senderId) && userStates.get(senderId).lockedCommand) {
      const lockedCommand = userStates.get(senderId).lockedCommand;
      const lockedCommandInstance = commands.get(lockedCommand);

      if (lockedCommandInstance) {
        return await lockedCommandInstance.execute(senderId, args, pageAccessToken, sendMessage);
      }
    } else {
      // Envoyer un message d'état si aucune commande n'est reconnue
      return await sendMessage(senderId, { text: "Je n'ai pas compris votre demande. Essayez une commande valide ou tapez 'help'." }, pageAccessToken);
    }
  }
}

// Fonction pour analyser une image avec un prompt
async function analyzeImageWithPrompt(senderId, imageUrl, prompt, pageAccessToken) {
  try {
    await sendMessage(senderId, { text: "🔍 Traitement de votre demande... ⏳" }, pageAccessToken);

    const analysisResult = await analyzeImageWithGemini(imageUrl, prompt);

    if (analysisResult) {
      await sendMessage(senderId, { text: `📄 Résultat de l'analyse :\n${analysisResult}` }, pageAccessToken);
    } else {
      await sendMessage(senderId, { text: "❌ Aucune donnée exploitable trouvée dans l'image." }, pageAccessToken);
    }

    userStates.set(senderId, { awaitingImagePrompt: true, imageUrl });
  } catch (error) {
    console.error('Erreur lors de l\'analyse de l\'image :', error);
    await sendMessage(senderId, { text: "⚠️ Une erreur est survenue lors de l'analyse." }, pageAccessToken);
  }
}

// Fonction pour vérifier l'abonnement d'un utilisateur
function checkSubscription(senderId) {
  const expirationDate = userSubscriptions.get(senderId);
  if (!expirationDate) return false;
  if (Date.now() < expirationDate) return true;

  userSubscriptions.delete(senderId);
  return false;
}

module.exports = { handleMessage };
