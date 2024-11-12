const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { sendMessage } = require('./sendMessage');

const commands = new Map();
const userStates = new Map(); // Suivi des états des utilisateurs
const userSubscriptions = new Map(); // Enregistre les abonnements utilisateurs
const userFreeQuestions = new Map(); // Enregistre le nombre de questions gratuites par utilisateur par jour
const validCodes = ["2201", "1206", "0612", "1212", "2003"];
const subscriptionDuration = 30 * 24 * 60 * 60 * 1000; // Durée d'abonnement : 30 jours en millisecondes

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
    // Gérer les images sans vérifier l'abonnement
    const imageUrl = event.message.attachments[0].payload.url;
    await handleImage(senderId, imageUrl, pageAccessToken, sendMessage);
  } else if (event.message.text) {
    const messageText = event.message.text.trim();

    // Si l'utilisateur n'est pas abonné et n'a pas envoyé un code d'activation, gérer les questions gratuites
    if (!isSubscribed) {
      if (validCodes.includes(messageText)) {
        // Si l'utilisateur envoie un code valide, activer l'abonnement
        userSubscriptions.set(senderId, Date.now());
        await sendMessage(senderId, { text: "✅ Abonnement activé avec succès !* Vous pouvez maintenant utiliser le chatbot sans restriction pendant 30 jours." }, pageAccessToken);
      } else if (canAskFreeQuestion(senderId)) {
        // Permettre jusqu'à 2 questions gratuites par jour
        incrementFreeQuestionCount(senderId);
        await handleText(senderId, messageText, pageAccessToken, sendMessage);
      } else {
        // L'utilisateur a atteint sa limite de questions gratuites
        await sendMessage(senderId, { text: "🚫 👋  Oups ! Tu as utilisé tes 2 questions gratuites pour aujourd'huiPour continuer à profiter de mes services, tu peux : Obtenir un code d'activation en t'abonnant à RTM Tafitaniaina  ➡️  https://www.facebook.com/manarintso.niaina Ou  via WhatsApp  📱  au +261385858330 .Une fois que tu as ton code d'activation, envoie-le moi  📧  et je t'activerai ! ." }, pageAccessToken);
      }
    } else {
      // L'utilisateur est abonné, traiter les messages texte normalement
      await handleText(senderId, messageText, pageAccessToken, sendMessage);
    }
  }
}

// Fonction pour vérifier l'abonnement
function checkSubscription(senderId) {
  if (!userSubscriptions.has(senderId)) return false;
  const subscriptionTime = userSubscriptions.get(senderId);
  if (Date.now() - subscriptionTime < subscriptionDuration) {
    return true;
  } else {
    // Supprimer l'abonnement s'il a expiré
    userSubscriptions.delete(senderId);
    return false;
  }
}

// Fonction pour gérer les images
async function handleImage(senderId, imageUrl, pageAccessToken, sendMessage) {
  try {
    await sendMessage(senderId, { text: '' }, pageAccessToken);

    const imageAnalysis = await analyzeImageWithGemini(imageUrl);

    if (imageAnalysis) {
      await sendMessage(senderId, { text: 'Que voulez-vous que je fasse avec cette image ?' }, pageAccessToken);
      userStates.set(senderId, { mode: 'image_action', imageAnalysis }); // Enregistrer l'analyse et passer en mode action
    } else {
      await sendMessage(senderId, { text: "Je n'ai pas pu obtenir de réponse concernant cette image." }, pageAccessToken);
    }
  } catch (error) {
    console.error('Erreur lors de l\'analyse de l\'image :', error);
    await sendMessage(senderId, { text: 'Erreur lors de l\'analyse de l\'image.' }, pageAccessToken);
  }
}

// Fonction pour gérer les textes
async function handleText(senderId, text, pageAccessToken, sendMessage) {
  const args = text.split(' ');
  const commandName = args.shift().toLowerCase();
  const command = commands.get(commandName);
  const userState = userStates.get(senderId);

  if (text.toLowerCase().startsWith("gemini générer")) {
    const prompt = text.replace("gemini générer", "").trim();
    await handleGeminiImageCommand(senderId, prompt, pageAccessToken);
  } else if (userState && userState.mode === 'image_action') {
    // L'utilisateur a donné une commande sur l'image
    await handleImageAction(senderId, text, userState.imageAnalysis, pageAccessToken, sendMessage);
  } else if (command) {
    // Exécuter la commande si elle est trouvée
    try {
      await command.execute(senderId, args, pageAccessToken, sendMessage);
    } catch (error) {
      console.error(`Erreur lors de l'exécution de la commande ${commandName}:`, error);
      await sendMessage(senderId, { text: `Erreur lors de l'exécution de la commande ${commandName}.` }, pageAccessToken);
    }
  } else {
    // Si aucune commande trouvée et pas en mode image
    const gpt4oCommand = commands.get('gpt4o');
    if (gpt4oCommand) {
      try {
        await gpt4oCommand.execute(senderId, [text], pageAccessToken, sendMessage);
      } catch (error) {
        console.error('Erreur avec GPT-4o :', error);
        await sendMessage(senderId, { text: 'Erreur lors de l\'utilisation de GPT-4o.' }, pageAccessToken);
      }
    } else {
      await sendMessage(senderId, { text: "Je n'ai pas pu traiter votre demande." }, pageAccessToken);
    }
  }
}

// Fonction pour gérer l'action demandée sur l'analyse de l'image
async function handleImageAction(senderId, userQuery, imageAnalysis, pageAccessToken, sendMessage) {
  try {
    // Utiliser GPT-4o pour traiter la description de l'image et la demande de l'utilisateur
    const gpt4oCommand = commands.get('gpt4o');
    if (gpt4oCommand) {
      const fullQuery = `Voici l'analyse de l'image : "${imageAnalysis}". L'utilisateur souhaite : "${userQuery}".`;
      await gpt4oCommand.execute(senderId, [fullQuery], pageAccessToken, sendMessage);
    } else {
      await sendMessage(senderId, { text: "Erreur : GPT-4o n'est pas disponible." }, pageAccessToken);
    }

    // Après avoir traité l'action, revenir au mode général
    userStates.set(senderId, { mode: 'general_discussion' });
  } catch (error) {
    console.error('Erreur lors de l\'action sur l\'image :', error);
    await sendMessage(senderId, { text: 'Erreur lors du traitement de votre demande.' }, pageAccessToken);
  }
}

// Fonction pour vérifier et augmenter le nombre de questions gratuites
function canAskFreeQuestion(senderId) {
  const today = new Date().toDateString();
  const userData = userFreeQuestions.get(senderId) || { count: 0, date: today };

  if (userData.date !== today) {
    // Réinitialiser le compteur quotidien
    userFreeQuestions.set(senderId, { count: 1, date: today });
    return true;
  } else if (userData.count < 2) {
    return true;
  }
  return false;
}

// Fonction pour incrémenter le nombre de questions gratuites
function incrementFreeQuestionCount(senderId) {
  const today = new Date().toDateString();
  const userData = userFreeQuestions.get(senderId) || { count: 0, date: today };
  userData.count += 1;
  userFreeQuestions.set(senderId, userData);
}

// Fonction pour appeler l'API Gemini pour analyser une image
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
