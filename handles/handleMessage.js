const fs = require('fs');
const path = require('path');
const { sendMessage } = require('./sendMessage');

const commands = new Map();
const userStates = new Map(); // Suivi des états des utilisateurs
const userSubscriptions = new Map(); // Enregistre les abonnements utilisateurs
const userFreeMessages = new Map(); // Suivi des messages gratuits par utilisateur (par jour)
const validCodes = ["2201", "1206", "0612", "1212", "2003"]; // Codes d'abonnement valides
const subscriptionDuration = 30 * 24 * 60 * 60 * 1000; // Durée de l'abonnement : 30 jours (en ms)
const freeMessageLimit = 3; // Limite de 3 questions gratuites par jour

// Charger les commandes
const commandFiles = fs.readdirSync(path.join(__dirname, '../commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`../commands/${file}`);
  commands.set(command.name, command);
}

// Fonction principale pour gérer les messages entrants
async function handleMessage(event, pageAccessToken) {
  const senderId = event.sender.id;

  // Vérifier si l'utilisateur est autorisé (abonné ou limite gratuite non atteinte)
  if (!isUserAllowed(senderId)) {
    await sendMessage(senderId, {
      text: "🚫 Vous avez atteint votre limite de 3 questions pour aujourd'hui. Abonnez-vous pour continuer !"
    }, pageAccessToken);
    return;
  }

  // Réduire le compteur de messages gratuits si l'utilisateur n'est pas abonné
  if (!checkSubscription(senderId)) {
    updateFreeMessages(senderId);
  }

  // Continuer avec le traitement normal des messages
  if (event.message.attachments && event.message.attachments[0].type === 'image') {
    const imageUrl = event.message.attachments[0].payload.url;
    await askForImagePrompt(senderId, imageUrl, pageAccessToken);
  } else if (event.message.text) {
    const messageText = event.message.text.trim();

    // Validation d'un code d'abonnement
    if (validCodes.includes(messageText)) {
      const expirationDate = Date.now() + subscriptionDuration;

      // Enregistrer l'abonnement
      userSubscriptions.set(senderId, {
        expirationDate,
        paymentVerified: true
      });

      await sendMessage(senderId, {
        text: `✅ Code validé ! Votre abonnement est actif jusqu'au ${new Date(expirationDate).toLocaleDateString()} !`
      }, pageAccessToken);
      return;
    }

    // Passer le message à la logique de commandes
    const args = messageText.split(' ');
    const commandName = args[0].toLowerCase();
    const command = commands.get(commandName);

    if (command) {
      return await command.execute(senderId, args.slice(1), pageAccessToken, sendMessage);
    } else {
      await sendMessage(senderId, { text: "Commande non reconnue. Tapez 'help' pour la liste des commandes." }, pageAccessToken);
    }
  }
}

// Vérifie si un utilisateur est autorisé à continuer
function isUserAllowed(senderId) {
  if (checkSubscription(senderId)) {
    return true; // Utilisateur abonné, accès illimité
  }
  return checkFreeMessages(senderId) > 0; // Vérifier la limite de questions gratuites
}

// Vérifie l'abonnement d'un utilisateur
function checkSubscription(senderId) {
  const subscription = userSubscriptions.get(senderId);
  if (!subscription) return false;

  const { expirationDate, paymentVerified } = subscription;
  if (!paymentVerified) return false;
  if (Date.now() < expirationDate) return true;

  userSubscriptions.delete(senderId); // Supprimer l'abonnement expiré
  return false;
}

// Vérifie les messages gratuits restants pour un utilisateur
function checkFreeMessages(senderId) {
  const today = new Date().toLocaleDateString();
  if (!userFreeMessages.has(senderId)) {
    userFreeMessages.set(senderId, { [today]: freeMessageLimit });
    return freeMessageLimit;
  }

  const userStats = userFreeMessages.get(senderId);
  if (!userStats[today]) {
    userStats[today] = freeMessageLimit;
    return freeMessageLimit;
  }

  return userStats[today];
}

// Réduit le compteur de messages gratuits
function updateFreeMessages(senderId) {
  const today = new Date().toLocaleDateString();
  if (!userFreeMessages.has(senderId)) {
    userFreeMessages.set(senderId, { [today]: freeMessageLimit - 1 });
  } else {
    const userStats = userFreeMessages.get(senderId);
    userStats[today] = (userStats[today] || freeMessageLimit) - 1;
    userFreeMessages.set(senderId, userStats);
  }
}

module.exports = { handleMessage };
