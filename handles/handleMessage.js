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
  const messageText = event.message?.text?.trim().toLowerCase();

  // Si l'utilisateur envoie "help", afficher les boutons de commande et passer en mode sélection
  if (messageText === 'help') {
    userStates.set(senderId, { mode: 'command_selection' }); // Passer en mode sélection de commande
    return await showCommands(senderId, pageAccessToken);
  }

  // Vérifier si l'utilisateur est en mode sélection de commande
  const userState = userStates.get(senderId);
  if (userState && userState.mode === 'command_selection') {
    // Exécuter la commande associée au bouton cliqué
    if (commands.has(messageText)) {
      return await executeCommand(senderId, messageText, pageAccessToken);
    } else {
      // Message d'erreur si la commande n'est pas valide
      return await sendMessage(senderId, { text: "Commande non reconnue. Tapez 'help' pour voir les commandes disponibles." }, pageAccessToken);
    }
  }

  // Vérifier si l'utilisateur est abonné ou utilise une question gratuite
  const isSubscribed = checkSubscription(senderId);
  if (isSubscribed || canAskFreeQuestion(senderId)) {
    incrementFreeQuestionCount(senderId);
    await handleText(senderId, messageText, pageAccessToken, sendMessage);
  } else {
    await sendMessage(senderId, { text: "🚫 Vous avez utilisé vos questions gratuites pour aujourd'hui. Veuillez vous abonner ou utiliser un code d'activation." }, pageAccessToken);
  }
}

// Fonction pour afficher les commandes disponibles sous forme de boutons
async function showCommands(senderId, pageAccessToken) {
  const buttons = Array.from(commands.keys()).map(command => ({
    content_type: 'text',
    title: command,
    payload: command
  }));

  await sendMessage(senderId, {
    text: "Voici les commandes disponibles :",
    quick_replies: buttons
  }, pageAccessToken);
}

// Fonction pour exécuter une commande lorsque l'utilisateur clique sur un bouton
async function executeCommand(senderId, commandName, pageAccessToken) {
  const command = commands.get(commandName);
  if (command) {
    try {
      await command.execute(senderId, [], pageAccessToken, sendMessage);
    } catch (error) {
      console.error(`Erreur lors de l'exécution de la commande ${commandName}:`, error);
      await sendMessage(senderId, { text: `Erreur lors de l'exécution de la commande ${commandName}.` }, pageAccessToken);
    }
  } else {
    await sendMessage(senderId, { text: "Commande non reconnue." }, pageAccessToken);
  }
}

// Fonction pour vérifier l'abonnement
function checkSubscription(senderId) {
  const expirationDate = userSubscriptions.get(senderId);
  if (!expirationDate) return false;
  if (Date.now() < expirationDate) return true;
  userSubscriptions.delete(senderId); // Supprimer l'abonnement si expiré
  return false;
}

// Fonctions utilitaires pour les questions gratuites et l'abonnement
function canAskFreeQuestion(senderId) {
  const today = new Date().toDateString();
  const userData = userFreeQuestions.get(senderId) || { count: 0, date: today };
  if (userData.date !== today) {
    userFreeQuestions.set(senderId, { count: 1, date: today });
    return true;
  } else if (userData.count < 2) {
    return true;
  }
  return false;
}

function incrementFreeQuestionCount(senderId) {
  const today = new Date().toDateString();
  const userData = userFreeQuestions.get(senderId) || { count: 0, date: today };
  userData.count += 1;
  userFreeQuestions.set(senderId, userData);
}

// Fonction pour gérer les messages texte
async function handleText(senderId, text, pageAccessToken, sendMessage) {
  // Votre logique ici pour gérer les messages texte de l'utilisateur
}

module.exports = { handleMessage };
