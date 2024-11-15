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
  
  // Vérifier si l'utilisateur est en mode verrouillé avec la commande AI
  const lockedCommand = userStates.get(senderId)?.lockedCommand;

  if (event.message.attachments && event.message.attachments[0].type === 'image') {
    const imageUrl = event.message.attachments[0].payload.url;
    await handleImage(senderId, imageUrl, pageAccessToken, sendMessage, lockedCommand);
  } else if (event.message.text) {
    const messageText = event.message.text.trim().toLowerCase();

    if (messageText === 'ai') {
      // Activer le mode verrouillé pour la commande AI
      userStates.set(senderId, { lockedCommand: 'ai' });
      await sendMessage(senderId, { text: "🔒 La commande 'ai' est maintenant verrouillée. Toutes vos questions seront traitées par cette commande. Tapez 'stop' pour quitter." }, pageAccessToken);
    } else if (messageText === 'stop') {
      // Désactiver le mode verrouillé
      userStates.delete(senderId);
      await sendMessage(senderId, { text: "🔓 Mode verrouillé désactivé. Vous pouvez maintenant poser vos questions librement." }, pageAccessToken);
    } else if (lockedCommand === 'ai') {
      // Si le mode verrouillé est actif avec la commande AI, traiter toutes les requêtes avec l'IA
      await handleAiLocked(senderId, messageText, pageAccessToken);
    } else {
      // Gestion standard pour les utilisateurs non verrouillés ou pour les commandes standard
      await handleText(senderId, messageText, pageAccessToken, sendMessage);
    }
  }
}

// Fonction pour gérer les messages texte dans le mode verrouillé
async function handleAiLocked(senderId, text, pageAccessToken) {
  await sendMessage(senderId, { text: "⏳ multyAi est en train de te répondre..." }, pageAccessToken);
  
  // Appel à GPT-4o dans le cas d'un texte, en tant que commande verrouillée
  const gpt4oCommand = commands.get('gpt4o');
  if (gpt4oCommand) {
    try {
      await gpt4oCommand.execute(senderId, [text], pageAccessToken, sendMessage);
    } catch (error) {
      console.error('Erreur avec GPT-4o :', error);
      await sendMessage(senderId, { text: 'Erreur lors de l\'utilisation de GPT-4o.' }, pageAccessToken);
    }
  } else {
    await sendMessage(senderId, { text: "Erreur : GPT-4o n'est pas disponible." }, pageAccessToken);
  }
}

// Fonction pour gérer les images avec prise en charge du mode verrouillé
async function handleImage(senderId, imageUrl, pageAccessToken, sendMessage, lockedCommand) {
  try {
    // Demande d'analyse de l'image sans affichage de statut
    const imageAnalysis = await analyzeImageWithGemini(imageUrl);

    if (imageAnalysis) {
      await sendMessage(senderId, { text: `Analyse de l'image : "${imageAnalysis}". Que voulez-vous faire avec cette image ?` }, pageAccessToken);

      // Vérifier si en mode verrouillé pour continuer la discussion dans ce mode
      if (lockedCommand === 'ai') {
        userStates.set(senderId, { mode: 'image_action', lockedCommand: 'ai', imageAnalysis });
      } else {
        userStates.set(senderId, { mode: 'image_action', imageAnalysis });
      }
    } else {
      await sendMessage(senderId, { text: "Je n'ai pas pu obtenir de réponse concernant cette image." }, pageAccessToken);
    }
  } catch (error) {
    console.error('Erreur lors de l\'analyse de l\'image :', error);
    await sendMessage(senderId, { text: 'Erreur lors de l\'analyse de l\'image.' }, pageAccessToken);
  }
}

// Fonction pour gérer l'action demandée sur l'analyse de l'image
async function handleImageAction(senderId, userQuery, imageAnalysis, pageAccessToken, sendMessage) {
  try {
    const fullQuery = `Voici l'analyse de l'image : "${imageAnalysis}". L'utilisateur souhaite : "${userQuery}".`;
    await handleAiLocked(senderId, fullQuery, pageAccessToken);
  } catch (error) {
    console.error('Erreur lors de l\'action sur l\'image :', error);
    await sendMessage(senderId, { text: 'Erreur lors du traitement de votre demande.' }, pageAccessToken);
  }

  // Retour au mode verrouillé général
  userStates.set(senderId, { lockedCommand: 'ai' });
}

// Fonction d'analyse avec l'API Gemini
async function analyzeImageWithGemini(imageUrl) {
  const geminiApiEndpoint = 'https://sandipbaruwal.onrender.com/gemini2';

  try {
    const response = await axios.get(`${geminiApiEndpoint}?url=${encodeURIComponent(imageUrl)}`);
    return response.data && response.data.answer ? response.data.answer : '';
  } catch (error) {
    console.error('Erreur avec Gemini :', error);
    throw new Error('Erreur lors de l\'analyse avec Gemini');
  }
}

module.exports = { handleMessage };
