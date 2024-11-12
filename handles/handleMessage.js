const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { sendMessage } = require('./sendMessage');

const commands = new Map();
const userStates = new Map(); // Suivi des états des utilisateurs
const userSubscriptions = new Map(); // Enregistre les abonnements utilisateurs avec une date d'expiration
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
        // Activer l'abonnement avec une date d'expiration
        const expirationDate = Date.now() + subscriptionDuration;
        userSubscriptions.set(senderId, expirationDate);
        await sendMessage(senderId, { text: "✅ Abonnement activé avec succès ! Vous pouvez maintenant utiliser le chatbot sans restriction pendant 30 jours." }, pageAccessToken);
      } else if (canAskFreeQuestion(senderId)) {
        // Permettre jusqu'à 2 questions gratuites par jour
        incrementFreeQuestionCount(senderId);
        await handleText(senderId, messageText, pageAccessToken, sendMessage);
      } else {
        await sendMessage(senderId, { text: "🚫 👋  Oups ! Tu as utilisé tes 2 questions gratuites pour aujourd'hui. Pour continuer à profiter de mes services, tu peux obtenir un code d'activation." }, pageAccessToken);
      }
    } else {
      // L'utilisateur est abonné, traiter les messages texte normalement
      await handleText(senderId, messageText, pageAccessToken, sendMessage);
    }
  }
}

// Fonction pour vérifier l'abonnement
function checkSubscription(senderId) {
  const expirationDate = userSubscriptions.get(senderId);
  if (!expirationDate) return false;
  if (Date.now() < expirationDate) return true;
  userSubscriptions.delete(senderId);
  return false;
}

// Fonction pour gérer les images et activer le mode d'analyse
async function handleImage(senderId, imageUrl, pageAccessToken, sendMessage) {
  try {
    const imageAnalysis = await analyzeImageWithGemini(imageUrl);
    if (imageAnalysis) {
      await sendMessage(senderId, { text: `L'image a été analysée : "${imageAnalysis}". Posez vos questions ou envoyez "stop" pour quitter.` }, pageAccessToken);
      userStates.set(senderId, { mode: 'image_analysis', imageAnalysis });
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
  const userState = userStates.get(senderId);

  if (userState && userState.mode === 'image_analysis') {
    if (text.toLowerCase() === 'stop') {
      // Quitter le mode d'analyse
      userStates.delete(senderId);
      await sendMessage(senderId, { text: "Analyse d'image terminée." }, pageAccessToken);
    } else {
      // Continuer à répondre sur l'image avec GPT-4o
      const fullQuery = `Image analysée : "${userState.imageAnalysis}". Question : "${text}".`;
      await sendMessage(senderId, { text: `Réponse basée sur l'image : ${fullQuery}` }, pageAccessToken);
    }
  } else {
    // Gérer les commandes ou le GPT-4o
    const args = text.split(' ');
    const commandName = args.shift().toLowerCase();
    const command = commands.get(commandName);
    
    if (command) {
      try {
        await command.execute(senderId, args, pageAccessToken, sendMessage);
      } catch (error) {
        console.error(`Erreur lors de l'exécution de la commande ${commandName}:`, error);
        await sendMessage(senderId, { text: `Erreur lors de l'exécution de la commande ${commandName}.` }, pageAccessToken);
      }
    } else {
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
}

// Fonction pour l'analyse d'image avec Gemini (simulée ici)
async function analyzeImageWithGemini(imageUrl) {
  try {
    const response = await axios.post('https://api.gemini.com/analyze', { imageUrl });
    return response.data.analysis || null;
  } catch (error) {
    console.error("Erreur lors de la requête d'analyse avec Gemini :", error);
    return null;
  }
}

// Fonction pour vérifier le nombre de questions gratuites disponibles
function canAskFreeQuestion(senderId) {
  const today = new Date().toDateString();
  const questionsToday = userFreeQuestions.get(senderId) || {};
  return (questionsToday[today] || 0) < 2;
}

// Fonction pour incrémenter le nombre de questions gratuites
function incrementFreeQuestionCount(senderId) {
  const today = new Date().toDateString();
  const questionsToday = userFreeQuestions.get(senderId) || {};
  questionsToday[today] = (questionsToday[today] || 0) + 1;
  userFreeQuestions.set(senderId, questionsToday);
}

module.exports = {
  handleMessage
};
