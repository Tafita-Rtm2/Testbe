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
    await requestImagePrompt(senderId, imageUrl, pageAccessToken, sendMessage);
  } else if (event.message.text) {
    const messageText = event.message.text.trim().toLowerCase();

    // Vérification pour les commandes spéciales de déverrouillage
    if (messageText === 'help') {
      const helpCommand = commands.get('help');
      if (helpCommand) {
        userStates.delete(senderId);
        return await helpCommand.execute(senderId, [], pageAccessToken, sendMessage);
      }
    } else if (messageText === 'stop') {
      userStates.delete(senderId);
      return await sendMessage(senderId, { text: "Vous avez quitté le mode commande verrouillée." }, pageAccessToken);
    }

    const userState = userStates.get(senderId);

    if (userState && userState.lockedCommand) {
      const lockedCommand = commands.get(userState.lockedCommand);
      if (lockedCommand) {
        return await lockedCommand.execute(senderId, [messageText], pageAccessToken, sendMessage);
      }
    } else {
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

// Demander à l'utilisateur de fournir un prompt pour l'image
async function requestImagePrompt(senderId, imageUrl, pageAccessToken, sendMessage) {
  await sendMessage(senderId, { text: "Veuillez entrer le prompt que vous souhaitez utiliser pour analyser l'image." }, pageAccessToken);
  userStates.set(senderId, { imageUrl });
}

// Gérer le prompt fourni par l'utilisateur pour analyser l'image
async function handleImagePrompt(senderId, prompt, pageAccessToken, sendMessage) {
  const { imageUrl } = userStates.get(senderId) || {};
  if (!imageUrl) return;

  try {
    await sendMessage(senderId, { text: "📷 Analyse de l'image en cours, veuillez patienter..." }, pageAccessToken);

    const imageAnalysis = await analyzeImageWithGemini(imageUrl, prompt);

    if (imageAnalysis) {
      await sendMessage(senderId, { text: `📄 Résultat de l'analyse pour le prompt "${prompt}" :\n${imageAnalysis}` }, pageAccessToken);
    } else {
      await sendMessage(senderId, { text: "❌ Aucune information exploitable n'a été détectée dans cette image." }, pageAccessToken);
    }
  } catch (error) {
    console.error('Erreur lors de l\'analyse de l\'image :', error);
    await sendMessage(senderId, { text: "⚠️ Une erreur est survenue lors de l'analyse de l'image." }, pageAccessToken);
  } finally {
    userStates.delete(senderId); // Réinitialiser l'état de l'utilisateur pour l'analyse d'image
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

// Fonction pour appeler l'API Gemini pour analyser une image
async function analyzeImageWithGemini(imageUrl, prompt) {
  const geminiApiEndpoint = 'https://sandipbaruwal.onrender.com/gemini2';

  try {
    const response = await axios.get(`${geminiApiEndpoint}?prompt=${encodeURIComponent(prompt)}&url=${encodeURIComponent(imageUrl)}`);
    return response.data && response.data.answer ? response.data.answer : '';
  } catch (error) {
    console.error('Erreur avec Gemini :', error);
    throw new Error('Erreur lors de l\'analyse avec Gemini');
  }
}

// Gérer les messages texte
async function handleText(senderId, text, pageAccessToken, sendMessage) {
  const args = text.split(' ');
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

// Autres fonctions d'abonnement, de vérification de questions gratuites, etc., restent inchangées

module.exports = { handleMessage };
