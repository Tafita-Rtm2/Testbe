const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { sendMessage } = require('./sendMessage');

const commands = new Map();
const userStates = new Map(); // Suivi des états des utilisateurs
const userSubscriptions = new Map(); // Enregistre les abonnements utilisateurs avec une date d'expiration
const validCodes = ["2201", "1206", "0612", "1212", "2003"]; // Codes d'abonnement valides
const subscriptionDuration = 30 * 24 * 60 * 60 * 1000; // Durée de l'abonnement : 30 jours en millisecondes

// Charger toutes les commandes disponibles
const commandFiles = fs.readdirSync(path.join(__dirname, '../commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`../commands/${file}`);
  commands.set(command.name, command);
}

// Fonction pour vérifier l'abonnement de l'utilisateur
function checkSubscription(senderId) {
  const expirationDate = userSubscriptions.get(senderId);
  if (!expirationDate) return false; // Pas d'abonnement
  if (Date.now() < expirationDate) return true; // Abonnement encore valide
  // Supprimer l'abonnement si expiré
  userSubscriptions.delete(senderId);
  return false;
}

// Fonction pour afficher les détails de l'abonnement
async function showSubscriptionDetails(senderId, pageAccessToken) {
  const expirationDate = userSubscriptions.get(senderId);

  if (!expirationDate) {
    await sendMessage(senderId, {
      text: "⛔ Vous n'êtes pas abonné. Veuillez fournir un code d'abonnement valide."
    }, pageAccessToken);
    return;
  }

  const now = Date.now();
  const subscriptionStartDate = new Date(expirationDate - subscriptionDuration);
  const subscriptionEndDate = new Date(expirationDate);

  if (now < expirationDate) {
    await sendMessage(senderId, {
      text: `📜 **Détails de votre abonnement**\n\n✅ **Début** : ${subscriptionStartDate.toLocaleString()}\n⏳ **Fin** : ${subscriptionEndDate.toLocaleString()}`
    }, pageAccessToken);
  } else {
    await sendMessage(senderId, {
      text: "❌ Votre abonnement a expiré."
    }, pageAccessToken);
    // Supprimer l'abonnement expiré
    userSubscriptions.delete(senderId);
    saveSubscriptions();
  }
}

// Fonction principale pour gérer les messages entrants
async function handleMessage(event, pageAccessToken) {
  const senderId = event.sender.id;

  // Vérifier si l'utilisateur est abonné
  const isSubscribed = checkSubscription(senderId);

  // Si l'utilisateur n'est pas abonné
  if (!isSubscribed) {
    const messageText = event.message.text ? event.message.text.trim() : null;

    // Validation du code d'abonnement
    if (messageText && validCodes.includes(messageText)) {
      const expirationDate = Date.now() + subscriptionDuration;
      userSubscriptions.set(senderId, expirationDate);
      await sendMessage(senderId, {
        text: `✅ Code validé ! Votre abonnement est actif jusqu'au ${new Date(expirationDate).toLocaleString()}.`
      }, pageAccessToken);
      return;
    }

    // Demander un abonnement si aucun code valide n'est fourni
    await sendMessage(senderId, {
      text: "⛔ Vous n'êtes pas abonné. Veuillez fournir un code d'abonnement valide pour activer les fonctionnalités."
    }, pageAccessToken);
    return;
  }

  // Si l'utilisateur est abonné, traiter les commandes et les interactions
  if (event.message.attachments && event.message.attachments[0].type === 'image') {
    const imageUrl = event.message.attachments[0].payload.url;
    await askForImagePrompt(senderId, imageUrl, pageAccessToken);
  } else if (event.message.text) {
    const messageText = event.message.text.trim();

    // Commande "abonnement" pour afficher les détails
    if (messageText.toLowerCase() === 'abonnement') {
      await showSubscriptionDetails(senderId, pageAccessToken);
      return;
    }

    // Commande "stop" pour quitter un mode
    if (messageText.toLowerCase() === 'stop') {
      userStates.delete(senderId);
      await sendMessage(senderId, { text: "🔓 Vous avez quitté le mode actuel." }, pageAccessToken);
      return;
    }

    // Vérification si l'utilisateur est en mode d'analyse d'image
    if (userStates.has(senderId) && userStates.get(senderId).awaitingImagePrompt) {
      const { imageUrl } = userStates.get(senderId);
      await analyzeImageWithPrompt(senderId, imageUrl, messageText, pageAccessToken);
      return;
    }

    // Vérifier si le message correspond à une commande existante
    const args = messageText.split(' ');
    const commandName = args[0].toLowerCase();
    const command = commands.get(commandName);

    if (command) {
      // Si l'utilisateur est verrouillé sur une autre commande
      if (userStates.has(senderId) && userStates.get(senderId).lockedCommand) {
        const previousCommand = userStates.get(senderId).lockedCommand;
        if (previousCommand !== commandName) {
          await sendMessage(senderId, { text: `🔓 Vous n'êtes plus verrouillé sur '${previousCommand}'. Basculé vers '${commandName}'.` }, pageAccessToken);
        }
      } else {
        await sendMessage(senderId, { text: `🔒 La commande '${commandName}' est maintenant verrouillée. Tapez 'stop' pour quitter.` }, pageAccessToken);
      }
      // Verrouiller sur la nouvelle commande
      userStates.set(senderId, { lockedCommand: commandName });
      return await command.execute(senderId, args.slice(1), pageAccessToken, sendMessage);
    }

    // Si l'utilisateur est déjà verrouillé sur une commande
    if (userStates.has(senderId) && userStates.get(senderId).lockedCommand) {
      const lockedCommand = userStates.get(senderId).lockedCommand;
      const lockedCommandInstance = commands.get(lockedCommand);
      if (lockedCommandInstance) {
        return await lockedCommandInstance.execute(senderId, args, pageAccessToken, sendMessage);
      }
    } else {
      // Message non reconnu
      await sendMessage(senderId, { text: "Commande non reconnue. Essayez 'help' pour voir la liste des commandes disponibles." }, pageAccessToken);
    }
  }
}

// Fonction pour demander le prompt pour une image
async function askForImagePrompt(senderId, imageUrl, pageAccessToken) {
  userStates.set(senderId, { awaitingImagePrompt: true, imageUrl: imageUrl });
  await sendMessage(senderId, {
    text: "📷 Image reçue. Que voulez-vous que je fasse avec cette image ?"
  }, pageAccessToken);
}

// Fonction pour analyser l'image avec un prompt
async function analyzeImageWithPrompt(senderId, imageUrl, prompt, pageAccessToken) {
  try {
    await sendMessage(senderId, { text: "🔍 Analyse en cours, veuillez patienter..." }, pageAccessToken);

    const imageAnalysis = await analyzeImageWithGemini(imageUrl, prompt);

    if (imageAnalysis) {
      await sendMessage(senderId, { text: `📄 Résultat :\n${imageAnalysis}` }, pageAccessToken);
    } else {
      await sendMessage(senderId, { text: "❌ Aucun résultat trouvé pour cette image." }, pageAccessToken);
    }

    // Rester en mode d'analyse d'image tant que l'utilisateur ne tape pas "stop"
    userStates.set(senderId, { awaitingImagePrompt: true, imageUrl: imageUrl });
  } catch (error) {
    console.error('Erreur lors de l\'analyse de l\'image :', error);
    await sendMessage(senderId, { text: "⚠️ Une erreur est survenue lors de l'analyse." }, pageAccessToken);
  }
}

// Fonction pour appeler l'API Gemini pour analyser une image avec un prompt
async function analyzeImageWithGemini(imageUrl, prompt) {
  const geminiApiEndpoint = 'https://sandipbaruwal.onrender.com/gemini2';

  try {
    const response = await axios.get(`${geminiApiEndpoint}?url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`);
    return response.data && response.data.answer ? response.data.answer : '';
  } catch (error) {
    console.error('Erreur avec Gemini :', error);
    throw new Error('Erreur lors de l\'analyse avec Gemini');
  }
}

module.exports = { handleMessage };
