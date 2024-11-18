const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { sendMessage } = require('./sendMessage');

const commands = new Map();
const userStates = new Map(); // Suivi des états des utilisateurs
const userSubscriptions = new Map(); // Enregistre les abonnements utilisateurs avec une date d'expiration
const validCodes = ["2201", "1206", "0612", "1212", "2003"]; // Codes d'abonnement valides
const subscriptionDuration = 30 * 24 * 60 * 60 * 1000; // Durée de l'abonnement : 30 jours en millisecondes
const adminCode = "2201018280"; // Code administrateur pour générer des codes

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

// Fonction pour générer un nouveau code d'abonnement
function generateSubscriptionCode() {
  const code = Math.random().toString().slice(2, 8); // Code à 6 chiffres
  validCodes.push(code);
  return code;
}

// Fonction pour sauvegarder l'état des abonnements
function saveSubscriptions() {
  const data = JSON.stringify(Object.fromEntries(userSubscriptions), null, 2);
  fs.writeFileSync('./subscriptions.json', data);
}

// Fonction pour charger les abonnements sauvegardés
function loadSubscriptions() {
  if (fs.existsSync('./subscriptions.json')) {
    const data = JSON.parse(fs.readFileSync('./subscriptions.json'));
    Object.entries(data).forEach(([userId, expirationDate]) => {
      userSubscriptions.set(userId, expirationDate);
    });
  }
}

// Charger les abonnements au démarrage
loadSubscriptions();

// Sauvegarder les abonnements à intervalles réguliers
setInterval(saveSubscriptions, 60000); // Toutes les 60 secondes

// Fonction principale pour gérer les messages entrants
async function handleMessage(event, pageAccessToken) {
  const senderId = event.sender.id;
  const messageText = event.message.text ? event.message.text.trim() : null;

  // Vérification de l'abonnement de l'utilisateur
  const isSubscribed = checkSubscription(senderId);

  // Gestion des codes administrateurs pour générer un nouveau code d'abonnement
  if (messageText === adminCode) {
    const newCode = generateSubscriptionCode();
    await sendMessage(senderId, {
      text: `✅ Nouveau code d'abonnement généré : ${newCode}.\nVous pouvez le partager avec un utilisateur pour activer un abonnement.`
    }, pageAccessToken);
    return;
  }

  // Gestion des utilisateurs non abonnés
  if (!isSubscribed) {
    if (messageText && validCodes.includes(messageText)) {
      const expirationDate = Date.now() + subscriptionDuration;
      userSubscriptions.set(senderId, expirationDate);

      const activationDate = new Date();
      const expirationDateFormatted = new Date(expirationDate).toLocaleString();

      await sendMessage(senderId, {
        text: `✅ Code validé !\n📅 Début de l'abonnement : ${activationDate.toLocaleString()}\n📅 Expiration : ${expirationDateFormatted}\n\nMerci pour votre abonnement !`
      }, pageAccessToken);
      return;
    }

    await sendMessage(senderId, {
      text: `⛔ Vous n'êtes pas abonné.\n\nVeuillez fournir un code d'abonnement valide pour activer les fonctionnalités.\n\n🔗 Facebook : [Cliquez ici](https://www.facebook.com/manarintso.niaina)\n📞 WhatsApp : +261385858330\n💰 Prix : 3000 Ar pour 30 jours.`
    }, pageAccessToken);
    return;
  }

  // Gestion des commandes après vérification de l'abonnement
  if (messageText.toLowerCase() === 'abonnement') {
    const expirationDate = userSubscriptions.get(senderId);
    const activationDate = new Date(expirationDate - subscriptionDuration);
    const expirationDateFormatted = new Date(expirationDate).toLocaleString();
    const activationDateFormatted = activationDate.toLocaleString();

    await sendMessage(senderId, {
      text: `📅 Votre abonnement est actif !\n\n🔐 Début : ${activationDateFormatted}\n🔓 Expiration : ${expirationDateFormatted}\n\nMerci de rester avec nous !`
    }, pageAccessToken);
    return;
  }

  // Gestion des autres commandes ou messages
  if (event.message.attachments && event.message.attachments[0].type === 'image') {
    const imageUrl = event.message.attachments[0].payload.url;
    await askForImagePrompt(senderId, imageUrl, pageAccessToken);
  } else if (event.message.text) {
    const args = messageText.split(' ');
    const commandName = args[0].toLowerCase();
    const command = commands.get(commandName);

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

    // Vérification et exécution des commandes existantes
    if (command) {
      userStates.set(senderId, { lockedCommand: commandName });
      return await command.execute(senderId, args.slice(1), pageAccessToken, sendMessage);
    }

    // Message non reconnu
    await sendMessage(senderId, { text: "Commande non reconnue. Essayez 'help' pour voir les commandes disponibles." }, pageAccessToken);
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
