const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { sendMessage } = require('./sendMessage');

const commands = new Map();
const userStates = new Map(); // Suivi des états des utilisateurs et du mode de commande verrouillée
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
    
    // Gestion du "command lock"
    const userState = userStates.get(senderId);
    if (userState && userState.lockedCommand && messageText !== "exit") {
      // Si une commande est verrouillée, exécutez-la avec le message actuel
      return await executeLockedCommand(senderId, messageText, pageAccessToken);
    }

    // Si l'utilisateur envoie "exit", libérez le "command lock"
    if (messageText === "exit") {
      userStates.set(senderId, { lockedCommand: null });
      return await sendMessage(senderId, { text: "Vous avez quitté le mode commande verrouillée." }, pageAccessToken);
    }

    // Si l'utilisateur n'est pas abonné et n'a pas envoyé un code d'activation, gérer les questions gratuites
    if (!isSubscribed) {
      if (validCodes.includes(messageText)) {
        const expirationDate = Date.now() + subscriptionDuration;
        userSubscriptions.set(senderId, expirationDate);
        await sendMessage(senderId, { text: "✅ Abonnement activé avec succès ! Vous pouvez maintenant utiliser le chatbot sans restriction pendant 30 jours." }, pageAccessToken);
      } else if (canAskFreeQuestion(senderId)) {
        incrementFreeQuestionCount(senderId);
        await handleText(senderId, messageText, pageAccessToken, sendMessage);
      } else {
        await sendMessage(senderId, { text: "🚫 👋 Oups ! Tu as utilisé tes 2 questions gratuites pour aujourd'hui. Pour continuer à profiter de mes services, tu peux obtenir un code d'activation en t'abonnant à RTM Tafitaniaina ➡️ https://www.facebook.com/manarintso.niaina Ou via WhatsApp 📱 au +261385858330 .Une fois que tu as ton code d'activation, envoie-le moi 📧 et je t'activerai !." }, pageAccessToken);
      }
    } else {
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

// Fonction pour gérer les images
async function handleImage(senderId, imageUrl, pageAccessToken, sendMessage) {
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

// Fonction pour gérer les textes
async function handleText(senderId, text, pageAccessToken, sendMessage) {
  const args = text.split(' ');
  const commandName = args.shift().toLowerCase();
  const command = commands.get(commandName);

  if (command) {
    userStates.set(senderId, { lockedCommand: commandName });
    await sendMessage(senderId, { text: `Commande '${commandName}' activée. Envoyez vos messages directement pour interagir avec cette commande. Tapez 'exit' pour quitter.` }, pageAccessToken);
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

// Fonction pour exécuter la commande verrouillée
async function executeLockedCommand(senderId, messageText, pageAccessToken) {
  const userState = userStates.get(senderId);
  const lockedCommandName = userState.lockedCommand;
  const command = commands.get(lockedCommandName);
  
  if (command) {
    try {
      await command.execute(senderId, [messageText], pageAccessToken, sendMessage);
    } catch (error) {
      console.error(`Erreur lors de l'exécution de la commande verrouillée ${lockedCommandName}:`, error);
      await sendMessage(senderId, { text: `Erreur lors de l'exécution de la commande ${lockedCommandName}.` }, pageAccessToken);
    }
  } else {
    await sendMessage(senderId, { text: "Erreur : La commande verrouillée n'est pas disponible." }, pageAccessToken);
  }
}

// Autres fonctions utilitaires (pour les abonnements, questions gratuites, analyse d'images, etc.)
// ...

module.exports = { handleMessage };
