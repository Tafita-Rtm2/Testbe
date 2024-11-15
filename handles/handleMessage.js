const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { sendMessage } = require('./sendMessage');

const commands = new Map();
const userStates = new Map(); // Suivi des états des utilisateurs et du mode de commande verrouillée
const userSubscriptions = new Map(); // Enregistre les abonnements utilisateurs avec une date d'expiration
const userFreeQuestions = new Map(); // Enregistre le nombre de questions gratuites par utilisateur par jour
const validCodes = ["2201", "1206", "0612", "1212", "2003"];
const subscriptionDuration = 30 * 24 * 60 * 60 * 1000; // Durée de l'abonnement : 30 jours en millisecondes

// Charger les commandes
const commandFiles = fs.readdirSync(path.join(__dirname, '../commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`../commands/${file}`);
  commands.set(command.name, command);
}

// Fonction principale pour gérer les messages entrants
async function handleMessage(event, pageAccessToken) {
  const senderId = event.sender.id;
  const messageText = event.message.text.trim().toLowerCase();

  // Gérer la commande spéciale 'exit' pour quitter le mode verrouillé
  if (messageText === 'exit') {
    userStates.delete(senderId); // Supprimer l'état verrouillé
    return await sendMessage(senderId, { text: "Vous avez quitté le mode commande verrouillée." }, pageAccessToken);
  }

  // Gérer la commande 'help'
  if (messageText === 'help') {
    return await sendHelpMessage(senderId, pageAccessToken);
  }

  // Vérifier si l'utilisateur est en mode de commande verrouillée
  const userState = userStates.get(senderId);
  if (userState && userState.lockedCommand) {
    return await executeLockedCommand(senderId, messageText, pageAccessToken);
  }

  // Vérifier si l'utilisateur envoie une commande initiale pour activer le mode verrouillé
  const args = messageText.split(' ');
  const commandName = args.shift().toLowerCase();
  const command = commands.get(commandName);

  if (command) {
    // Activer le mode verrouillé pour cette commande
    userStates.set(senderId, { lockedCommand: commandName });
    await sendMessage(senderId, { text: `Commande '${commandName}' activée en mode verrouillé. Tapez 'exit' pour quitter.` }, pageAccessToken);
    return await command.execute(senderId, args, pageAccessToken, sendMessage);
  }

  // Si aucun état verrouillé et pas de commande valide, envoyer un message d'erreur
  await sendMessage(senderId, { text: "Commande non reconnue. Tapez 'help' pour voir la liste des commandes disponibles." }, pageAccessToken);
}

// Fonction pour envoyer la liste des commandes disponibles
async function sendHelpMessage(senderId, pageAccessToken) {
  const helpText = "Voici les commandes disponibles:\n";
  for (const [name] of commands) {
    helpText += `- ${name}\n`;
  }
  helpText += "\nTapez une commande pour l'activer. Tapez 'exit' pour quitter une commande verrouillée.";
  await sendMessage(senderId, { text: helpText }, pageAccessToken);
}

// Fonction pour exécuter la commande verrouillée
async function executeLockedCommand(senderId, messageText, pageAccessToken) {
  const userState = userStates.get(senderId);
  const lockedCommandName = userState.lockedCommand;
  const command = commands.get(lockedCommandName);

  if (command) {
    try {
      await command.execute(senderId, [messageText], pageAccessToken, sendMessage);
    } catch (error) {
      console.error(`Erreur lors de l'exécution de la commande verrouillée ${lockedCommandName}:`, error);
      await sendMessage(senderId, { text: `Erreur lors de l'exécution de la commande ${lockedCommandName}.` }, pageAccessToken);
    }
  } else {
    await sendMessage(senderId, { text: "Erreur : La commande verrouillée n'est pas disponible." }, pageAccessToken);
  }
}

// Fonction pour gérer les abonnements et les questions gratuites (ajoutez vos autres fonctions de gestion ici)

// Exporter la fonction handleMessage pour l'utiliser dans l'application
module.exports = { handleMessage };
