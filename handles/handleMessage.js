const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { sendMessage } = require('./sendMessage');

const commands = new Map();
const userStates = new Map();
const userSubscriptions = new Map();
const userFreeQuestions = new Map();
const validCodes = ["2201", "1206", "0612", "1212", "2003"];
const subscriptionDuration = 30 * 24 * 60 * 60 * 1000;
const subscriptionCost = 3000;

// Charger les commandes
const commandFiles = fs.readdirSync(path.join(__dirname, '../commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`../commands/${file}`);
  commands.set(command.name, command);
}

// Fonction principale pour gérer les messages entrants
async function handleMessage(event, pageAccessToken) {
  const senderId = event.sender.id;

  const isSubscribed = checkSubscription(senderId);

  if (event.message.attachments && event.message.attachments[0].type === 'image') {
    const imageUrl = event.message.attachments[0].payload.url;
    await handleImage(senderId, imageUrl, pageAccessToken, sendMessage);
  } else if (event.message.text) {
    const messageText = event.message.text.trim().toLowerCase();

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

// Fonction pour vérifier l'abonnement
function checkSubscription(senderId) {
  const expirationDate = userSubscriptions.get(senderId);
  if (!expirationDate) return false;
  if (Date.now() < expirationDate) return true;
  userSubscriptions.delete(senderId);
  return false;
}

// Fonction pour gérer les images avec analyse avancée
async function handleImage(senderId, imageUrl, pageAccessToken, sendMessage) {
  try {
    await sendMessage(senderId, { text: "📷 Analyse de l'image en cours, veuillez patienter..." }, pageAccessToken);

    const imageAnalysis = await analyzeImageWithGemini(imageUrl);

    if (imageAnalysis) {
      let response = `📄 **Description de l'image** :\n${imageAnalysis.description || "Aucune description disponible."}`;

      if (imageAnalysis.questions && imageAnalysis.questions.length > 0) {
        response += `\n\n❓ **Questions détectées** :\n${imageAnalysis.questions.join('\n')}`;
        for (const question of imageAnalysis.questions) {
          response += `\n\n💡 **Réponse à la question** :\n${question}\n➡️ ${imageAnalysis.answers[question] || "Pas de réponse disponible."}`;
        }
      }

      if (imageAnalysis.person) {
        response += `\n\n👤 **Personne identifiée** : ${imageAnalysis.person}`;
      }

      await sendMessage(senderId, { text: response }, pageAccessToken);
    } else {
      await sendMessage(senderId, { text: "❌ Aucune information exploitable n'a été détectée dans cette image." }, pageAccessToken);
    }
  } catch (error) {
    console.error('Erreur lors de l\'analyse de l\'image :', error);
    await sendMessage(senderId, { text: "⚠️ Une erreur est survenue lors de l'analyse de l'image." }, pageAccessToken);
  }
}

// Fonction pour gérer les textes
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

// Fonction pour appeler l'API Gemini
async function analyzeImageWithGemini(imageUrl) {
  const geminiApiEndpoint = 'https://sandipbaruwal.onrender.com/gemini2';

  try {
    const response = await axios.get(`${geminiApiEndpoint}?url=${encodeURIComponent(imageUrl)}`);
    return response.data || {};
  } catch (error) {
    console.error('Erreur avec Gemini :', error);
    throw new Error('Erreur lors de l\'analyse avec Gemini');
  }
}

// Fonction pour vérifier et augmenter les questions gratuites
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

function incrementFreeQuestionCount(senderId) {
  const today = new Date().toDateString();
  const userData = userFreeQuestions.get(senderId) || { count: 0, date: today };
  userData.count += 1;
  userFreeQuestions.set(senderId, userData);
}

module.exports = { handleMessage };
