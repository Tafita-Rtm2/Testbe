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
    // Gérer les images sans vérifier l'abonnement
    const imageUrl = event.message.attachments[0].payload.url;
    await handleImage(senderId, imageUrl, pageAccessToken, sendMessage);
  } else if (event.message.text) {
    const messageText = event.message.text.trim().toLowerCase();

    // Vérification pour les commandes spéciales de déverrouillage
    if (messageText === 'help') {
      // Exécuter directement la commande help si elle existe
      const helpCommand = commands.get('help');
      if (helpCommand) {
        userStates.delete(senderId); // Déverrouiller toute commande active
        return await helpCommand.execute(senderId, [], pageAccessToken, sendMessage);
      }
    } else if (messageText === 'stop') {
      userStates.delete(senderId); // Quitter le mode verrouillé
      return await sendMessage(senderId, { text: "Vous avez quitté le mode commande verrouillée." }, pageAccessToken);
    }

    const userState = userStates.get(senderId);

    if (userState && userState.lockedCommand) {
      // Si une commande est verrouillée, exécutez-la sans vérifier le nom de la commande
      const lockedCommand = commands.get(userState.lockedCommand);
      if (lockedCommand) {
        return await lockedCommand.execute(senderId, [messageText], pageAccessToken, sendMessage);
      }
    } else {
      // Si l'utilisateur n'est pas abonné et n'a pas envoyé un code d'activation, gérer les questions gratuites
      if (!isSubscribed) {
        if (validCodes.includes(messageText)) {
          // Si l'utilisateur envoie un code valide, activer l'abonnement avec une date d'expiration
          const expirationDate = Date.now() + subscriptionDuration;
          userSubscriptions.set(senderId, expirationDate);
          await sendMessage(senderId, { text: "✅ Abonnement activé avec succès ! Vous pouvez maintenant utiliser le chatbot sans restriction pendant 30 jours." }, pageAccessToken);
        } else if (canAskFreeQuestion(senderId)) {
          // Permettre jusqu'à 2 questions gratuites par jour
          incrementFreeQuestionCount(senderId);
          await handleText(senderId, messageText, pageAccessToken, sendMessage);
        } else {
          // L'utilisateur a atteint sa limite de questions gratuites
          await sendMessage(senderId, { text: "🚫 👋 Oups ! Tu as utilisé tes 2 questions gratuites pour aujourd'hui. Pour continuer à profiter de mes services, tu peux obtenir un code d'activation." }, pageAccessToken);
        }
      } else {
        // L'utilisateur est abonné, traiter les messages texte normalement
        await handleText(senderId, messageText, pageAccessToken, sendMessage);
      }
    }
  }
}

// Fonction pour vérifier l'abonnement
function checkSubscription(senderId) {
  const expirationDate = userSubscriptions.get(senderId);
  
  if (!expirationDate) return false; // Pas d'abonnement
  if (Date.now() < expirationDate) return true; // Abonnement encore valide
  
  // Supprimer l'abonnement si expiré
  userSubscriptions.delete(senderId);
  return false;
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

  if (command) {
    // Activer le verrouillage de la commande sélectionnée
    userStates.set(senderId, { lockedCommand: commandName });
    await sendMessage(senderId, { text: `🔒 La commande '${commandName}' est maintenant verrouillée. Toutes vos questions seront traitées par cette commande. Tapez 'stop' pour quitter.` }, pageAccessToken);
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
