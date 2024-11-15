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
    await handleImage(senderId, imageUrl, pageAccessToken, sendMessage);
  } else if (event.message.text) {
    const messageText = event.message.text.trim().toLowerCase();

    // Gestion des commandes "stop" et "help"
    if (messageText === 'help') {
      const helpCommand = commands.get('help');
      if (helpCommand) {
        userStates.delete(senderId);
        return await helpCommand.execute(senderId, [], pageAccessToken, sendMessage);
      }
    } else if (messageText === 'stop') {
      userStates.delete(senderId);
      return await sendMessage(senderId, { text: "🛑 Analyse interrompue. Tapez 'help' pour plus d'informations ou envoyez une autre image pour recommencer." }, pageAccessToken);
    }

    // Si une commande est verrouillée
    const userState = userStates.get(senderId);
    if (userState && userState.lockedCommand) {
      const lockedCommand = commands.get(userState.lockedCommand);
      if (lockedCommand) {
        return await lockedCommand.execute(senderId, [messageText], pageAccessToken, sendMessage);
      }
    } else {
      // Gérer les abonnements ou questions gratuites
      if (!isSubscribed) {
        if (validCodes.includes(messageText)) {
          const expirationDate = Date.now() + subscriptionDuration;
          userSubscriptions.set(senderId, expirationDate);
          await sendMessage(senderId, { text: "✅ Abonnement activé avec succès ! Vous pouvez maintenant utiliser le chatbot sans restriction pendant 30 jours." }, pageAccessToken);
        } else if (canAskFreeQuestion(senderId)) {
          incrementFreeQuestionCount(senderId);
          await handleText(senderId, messageText, pageAccessToken, sendMessage);
        } else {
          await sendMessage(senderId, { text: "🚫 👋 Oups ! Tu as utilisé tes 2 questions gratuites pour aujourd'hui. Pour continuer à profiter de mes services, tu peux obtenir un code d'activation." }, pageAccessToken);
        }
      } else {
        await handleText(senderId, messageText, pageAccessToken, sendMessage);
      }
    }
  }
}

// Fonction pour gérer les images
async function handleImage(senderId, imageUrl, pageAccessToken, sendMessage) {
  try {
    await sendMessage(senderId, { text: "📷 Analyse de l'image en cours, veuillez patienter..." }, pageAccessToken);

    const imageAnalysis = await analyzeImageWithGemini(imageUrl);

    if (imageAnalysis) {
      await sendMessage(senderId, { text: `📄 Questions détectées dans l'image : \n${imageAnalysis}\n💡 Réponses en cours...` }, pageAccessToken);

      // Mode analyse continue
      userStates.set(senderId, { analyzingImage: true });
      const questions = imageAnalysis.split('\n'); // Supposons que les questions sont séparées par des sauts de ligne
      for (const question of questions) {
        if (!userStates.get(senderId)?.analyzingImage) break; // Interrompre si "stop" est envoyé
        await handleText(senderId, question, pageAccessToken, sendMessage);
      }

      await sendMessage(senderId, { text: "✅ Analyse terminée. Envoyez une autre image ou tapez 'stop' pour quitter." }, pageAccessToken);
    } else {
      await sendMessage(senderId, { text: "❌ Aucune question détectée dans cette image." }, pageAccessToken);
    }
  } catch (error) {
    console.error('Erreur lors de l\'analyse de l\'image :', error);
    await sendMessage(senderId, { text: "⚠️ Une erreur est survenue lors de l'analyse de l'image." }, pageAccessToken);
  }
}

// Reste des fonctions (inchangées)...

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
