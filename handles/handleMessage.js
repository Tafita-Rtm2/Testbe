const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { sendMessage } = require('./sendMessage');

const commands = new Map();
const userStates = new Map(); // Suivi des états des utilisateurs
const activationCodes = ['2201', '1206', '0612', '1212', '2003']; // Codes de validation valides
const subscriptionDuration = 30 * 24 * 60 * 60 * 1000; // Durée de 30 jours en millisecondes
const userSubscriptions = new Map(); // Stockage des abonnements des utilisateurs

// Charger les commandes
const commandFiles = fs.readdirSync(path.join(__dirname, '../commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`../commands/${file}`);
  commands.set(command.name, command);
}

// Fonction pour vérifier l'abonnement de l'utilisateur
function isUserSubscribed(senderId) {
  const subscription = userSubscriptions.get(senderId);
  if (!subscription) return false;

  const { activationDate } = subscription;
  const currentDate = Date.now();
  return currentDate - activationDate < subscriptionDuration;
}

// Fonction pour activer l'abonnement de l'utilisateur
function activateSubscription(senderId) {
  userSubscriptions.set(senderId, { activationDate: Date.now() });
}

// Fonction principale pour gérer les messages entrants
async function handleMessage(event, pageAccessToken) {
  const senderId = event.sender.id;

  // Vérifiez si l'utilisateur est abonné
  if (!isUserSubscribed(senderId)) {
    // Si le message correspond à un code d'activation valide
    if (activationCodes.includes(event.message.text.trim())) {
      activateSubscription(senderId);
      await sendMessage(senderId, {
        text: "✅ Votre abonnement a été activé avec succès ! Vous avez accès au chatbot pour les 30 prochains jours."
      }, pageAccessToken);
    } else {
      // Demande à l'utilisateur de saisir un code d'activation valide
      await sendMessage(senderId, {
        text: "🔒 Veuillez entrer votre code d'activation pour accéder au chatbot.\n\n" +
              "👉 Si vous n'avez pas encore d'abonnement, veuillez contacter Tafitaniaina RTM via [Facebook](https://facebook.com/votreprofil) " +
              "ou WhatsApp au +261 38 58 58 330. Les codes de validation sont valables pour 30 jours."
      }, pageAccessToken);
      return;
    }
  }

  // Suite du traitement des messages si l'utilisateur est abonné
  if (event.message.attachments && event.message.attachments[0].type === 'image') {
    const imageUrl = event.message.attachments[0].payload.url;
    await handleImage(senderId, imageUrl, pageAccessToken, sendMessage);
  } else if (event.message.text) {
    const messageText = event.message.text.trim();
    await handleText(senderId, messageText, pageAccessToken, sendMessage);
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

// Reste du code existant

module.exports = { handleMessage };
