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
    // Gérer les images
    const imageUrl = event.message.attachments[0].payload.url;
    await askForImagePrompt(senderId, imageUrl, pageAccessToken);
  } else if (event.message.text) {
    const messageText = event.message.text.trim().toLowerCase();

    if (userStates.has(senderId) && userStates.get(senderId).awaitingImagePrompt) {
      // Utiliser le prompt de l'utilisateur pour analyser l'image
      const imageUrl = userStates.get(senderId).imageUrl;
      userStates.get(senderId).lockedImage = true; // Verrouiller l'image pour les questions suivantes
      userStates.get(senderId).prompt = messageText; // Stocker le prompt initial
      await analyzeImageWithPrompt(senderId, imageUrl, messageText, pageAccessToken);
    } else if (userStates.has(senderId) && userStates.get(senderId).lockedImage) {
      // Poser une question supplémentaire sur l'image verrouillée
      const imageUrl = userStates.get(senderId).imageUrl;
      const prompt = messageText;
      await analyzeImageWithPrompt(senderId, imageUrl, prompt, pageAccessToken);
    } else {
      // Autres traitements de texte
      await handleText(senderId, messageText, pageAccessToken, sendMessage);
    }
  }
}

// Demander le prompt de l'utilisateur pour analyser l'image
async function askForImagePrompt(senderId, imageUrl, pageAccessToken) {
  userStates.set(senderId, { awaitingImagePrompt: true, imageUrl: imageUrl });
  await sendMessage(senderId, { text: "Veuillez entrer le prompt que vous souhaitez utiliser pour analyser l'image." }, pageAccessToken);
}

// Fonction pour analyser l'image avec le prompt fourni par l'utilisateur
async function analyzeImageWithPrompt(senderId, imageUrl, prompt, pageAccessToken) {
  try {
    await sendMessage(senderId, { text: "📷 Analyse de l'image en cours, veuillez patienter..." }, pageAccessToken);

    const imageAnalysis = await analyzeImageWithGemini(imageUrl, prompt);

    if (imageAnalysis) {
      await sendMessage(senderId, { text: `📄 Résultat de l'analyse :\n${imageAnalysis}` }, pageAccessToken);
    } else {
      await sendMessage(senderId, { text: "❌ Aucune information exploitable n'a été détectée dans cette image." }, pageAccessToken);
    }
  } catch (error) {
    console.error('Erreur lors de l\'analyse de l\'image :', error);
    await sendMessage(senderId, { text: "⚠️ Une erreur est survenue lors de l'analyse de l'image." }, pageAccessToken);
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

// Fonction pour vérifier l'abonnement de l'utilisateur
function checkSubscription(senderId) {
  const expirationDate = userSubscriptions.get(senderId);
  
  if (!expirationDate) return false; // Pas d'abonnement
  if (Date.now() < expirationDate) return true; // Abonnement encore valide
  
  // Supprimer l'abonnement si expiré
  userSubscriptions.delete(senderId);
  return false;
}

// Traiter les messages textuels
async function handleText(senderId, messageText, pageAccessToken, sendMessage) {
  const args = messageText.split(' ');
  const commandName = args.shift().toLowerCase();
  const command = commands.get(commandName);

  if (command) {
    await sendMessage(senderId, { text: `🔒 La commande '${commandName}' est maintenant verrouillée. Toutes vos questions seront traitées par cette commande. Tapez 'stop' pour quitter.` }, pageAccessToken);
    
    userStates.set(senderId, { lockedCommand: commandName });
    return await command.execute(senderId, args, pageAccessToken, sendMessage);
  } else {
    const gpt4oCommand = commands.get('gpt4o');
    if (gpt4oCommand) {
      try {
        await gpt4oCommand.execute(senderId, [messageText], pageAccessToken, sendMessage);
      } catch (error) {
        console.error('Erreur avec GPT-4o :', error);
        await sendMessage(senderId, { text: 'Erreur lors de l\'utilisation de GPT-4o.' }, pageAccessToken);
      }
    } else {
      await sendMessage(senderId, { text: "Je n'ai pas pu traiter votre demande." }, pageAccessToken);
    }
  }
}

// Vérifier et augmenter le nombre de questions gratuites
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

// Incrémenter le nombre de questions gratuites
function incrementFreeQuestionCount(senderId) {
  const today = new Date().toDateString();
  const userData = userFreeQuestions.get(senderId) || { count: 0, date: today };
  userData.count += 1;
  userFreeQuestions.set(senderId, userData);
}

module.exports = { handleMessage };
