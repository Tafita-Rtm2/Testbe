const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { sendMessage } = require('./sendMessage');

const commands = new Map();
const userStates = new Map();
const userSubscriptions = new Map(); // Enregistre les abonnements utilisateurs avec une date d'expiration
const userFreeQuestions = new Map(); // Enregistre les questions gratuites par utilisateur et par jour
const validCodes = ["2201", "1206", "0612", "1212", "2003"];
const subscriptionDuration = 30 * 24 * 60 * 60 * 1000; // 30 jours en millisecondes

// Charger les commandes
const commandFiles = fs.readdirSync(path.join(__dirname, '../commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`../commands/${file}`);
  commands.set(command.name, command);
}

// Fonction principale pour gérer les messages entrants
async function handleMessage(event, pageAccessToken) {
  const senderId = event.sender.id;
  const isSubscribed = checkSubscription(senderId); // Vérifie si l'utilisateur est encore abonné

  if (event.message.attachments && event.message.attachments[0].type === 'image') {
    // Gérer les images sans vérifier l'abonnement
    const imageUrl = event.message.attachments[0].payload.url;
    await handleImage(senderId, imageUrl, pageAccessToken);
  } else if (event.message.text) {
    const messageText = event.message.text.trim();

    if (!isSubscribed) {
      if (validCodes.includes(messageText)) {
        // Active l'abonnement pour 30 jours si le code est valide
        const expirationDate = Date.now() + subscriptionDuration;
        userSubscriptions.set(senderId, expirationDate);
        await sendMessage(senderId, { text: "✅ Abonnement activé avec succès ! Vous pouvez maintenant utiliser le chatbot sans restriction pendant 30 jours." }, pageAccessToken);
      } else if (canAskFreeQuestion(senderId)) {
        // Permet jusqu'à 2 questions gratuites par jour
        incrementFreeQuestionCount(senderId);
        await handleText(senderId, messageText, pageAccessToken);
      } else {
        // Message de limitation de questions gratuites
        await sendMessage(senderId, { text: "🚫 Oups ! Tu as utilisé tes 2 questions gratuites pour aujourd'hui. Pour continuer, abonne-toi en obtenant un code d'activation." }, pageAccessToken);
      }
    } else {
      // L'utilisateur est abonné, traiter les messages normalement
      await handleText(senderId, messageText, pageAccessToken);
    }
  }
}

// Vérifie l'état de l'abonnement d'un utilisateur
function checkSubscription(senderId) {
  const expirationDate = userSubscriptions.get(senderId);
  
  if (!expirationDate) return false; // Pas d'abonnement
  if (Date.now() < expirationDate) return true; // Abonnement valide

  // Supprime l'abonnement si expiré
  userSubscriptions.delete(senderId);
  return false;
}

// Gère les images envoyées par l'utilisateur
async function handleImage(senderId, imageUrl, pageAccessToken) {
  try {
    await sendMessage(senderId, { text: '' }, pageAccessToken);
    const imageAnalysis = await analyzeImageWithGemini(imageUrl);

    if (imageAnalysis) {
      await sendMessage(senderId, { text: 'Que voulez-vous que je fasse avec cette image ?' }, pageAccessToken);
      userStates.set(senderId, { mode: 'image_action', imageAnalysis });
    } else {
      await sendMessage(senderId, { text: "Je n'ai pas pu obtenir de réponse concernant cette image." }, pageAccessToken);
    }
  } catch (error) {
    console.error('Erreur lors de l\'analyse de l\'image :', error);
    await sendMessage(senderId, { text: 'Erreur lors de l\'analyse de l\'image.' }, pageAccessToken);
  }
}

// Gère les messages texte
async function handleText(senderId, text, pageAccessToken) {
  const args = text.split(' ');
  const commandName = args.shift().toLowerCase();
  const command = commands.get(commandName);
  const userState = userStates.get(senderId);

  if (text.toLowerCase().startsWith("gemini générer")) {
    const prompt = text.replace("gemini générer", "").trim();
    await handleGeminiImageCommand(senderId, prompt, pageAccessToken);
  } else if (userState && userState.mode === 'image_action') {
    await handleImageAction(senderId, text, userState.imageAnalysis, pageAccessToken);
  } else if (command) {
    try {
      await command.execute(senderId, args, pageAccessToken, sendMessage);
    } catch (error) {
      console.error(`Erreur lors de l'exécution de la commande ${commandName}:`, error);
      await sendMessage(senderId, { text: `Erreur lors de l'exécution de la commande ${commandName}.` }, pageAccessToken);
    }
  } else {
    await sendMessage(senderId, { text: "Je n'ai pas pu traiter votre demande." }, pageAccessToken);
  }
}

// Fonction pour gérer l'action demandée sur l'image
async function handleImageAction(senderId, userQuery, imageAnalysis, pageAccessToken) {
  try {
    const gpt4oCommand = commands.get('gpt4o');
    if (gpt4oCommand) {
      const fullQuery = `Voici l'analyse de l'image : "${imageAnalysis}". L'utilisateur souhaite : "${userQuery}".`;
      await gpt4oCommand.execute(senderId, [fullQuery], pageAccessToken, sendMessage);
    } else {
      await sendMessage(senderId, { text: "Erreur : GPT-4o n'est pas disponible." }, pageAccessToken);
    }

    userStates.set(senderId, { mode: 'general_discussion' });
  } catch (error) {
    console.error('Erreur lors de l\'action sur l\'image :', error);
    await sendMessage(senderId, { text: 'Erreur lors du traitement de votre demande.' }, pageAccessToken);
  }
}

// Vérifie si l'utilisateur peut poser une question gratuite
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

// Incrémente le nombre de questions gratuites de l'utilisateur
function incrementFreeQuestionCount(senderId) {
  const today = new Date().toDateString();
  const userData = userFreeQuestions.get(senderId) || { count: 0, date: today };
  userData.count += 1;
  userFreeQuestions.set(senderId, userData);
}

// Analyse l'image avec l'API Gemini
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
