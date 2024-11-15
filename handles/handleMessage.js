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
    // Gérer l'image : Demander un prompt pour analyser l'image
    const imageUrl = event.message.attachments[0].payload.url;
    await askForImagePrompt(senderId, imageUrl, pageAccessToken);
  } else if (event.message.text) {
    const messageText = event.message.text.trim().toLowerCase();

    // Commande "stop" pour annuler tout état verrouillé
    if (messageText === 'stop') {
      userStates.delete(senderId);
      await sendMessage(senderId, { text: "🔓 Toutes les commandes ou verrouillages ont été arrêtés." }, pageAccessToken);
      return;
    }

    // Si l'utilisateur a déjà envoyé une image et a demandé une analyse, gérer la discussion sur cette image
    if (userStates.has(senderId) && userStates.get(senderId).awaitingImagePrompt) {
      const imageState = userStates.get(senderId);
      
      // Si l'utilisateur a déjà obtenu des résultats d'analyse, répondre aux questions supplémentaires
      if (imageState.analysisResults) {
        // Ici, nous répondons à l'utilisateur en fonction du texte envoyé après l'analyse
        const question = messageText; // L'utilisateur pose une question basée sur l'analyse
        const analysisResults = imageState.analysisResults;
        
        // Pour la discussion, vous pouvez inclure des règles de base (par exemple, recherche dans les résultats d'analyse)
        const response = analyzeImageDiscussion(analysisResults, question);
        
        // Envoyer la réponse à l'utilisateur
        await sendMessage(senderId, { text: response }, pageAccessToken);
        return;
      } else {
        // Si l'analyse n'est pas encore faite, on demande d'abord un prompt
        await sendMessage(senderId, { text: "Veuillez entrer le prompt pour analyser l'image." }, pageAccessToken);
        return;
      }
    }

    // Vérification si le message correspond au nom d'une commande pour déverrouiller et basculer
    const args = messageText.split(' ');
    const commandName = args[0].toLowerCase(); // Le premier mot est le nom potentiel de la commande
    const command = commands.get(commandName);

    if (command) {
      // Si l'utilisateur était verrouillé sur une autre commande, on déverrouille
      if (userStates.has(senderId) && userStates.get(senderId).lockedCommand) {
        const previousCommand = userStates.get(senderId).lockedCommand;
        if (previousCommand !== commandName) {
          await sendMessage(senderId, { text: `🔓 Vous n'êtes plus verrouillé sur '${previousCommand}'. Basculé vers '${commandName}'.` }, pageAccessToken);
        }
      } else {
        await sendMessage(senderId, { text: `🔒 La commande '${commandName}' est maintenant verrouillée. Toutes vos questions seront traitées par cette commande. Tapez 'stop' pour quitter.` }, pageAccessToken);
      }

      // Verrouiller sur la nouvelle commande
      userStates.set(senderId, { lockedCommand: commandName });
      return await command.execute(senderId, args.slice(1), pageAccessToken, sendMessage);
    }

    // Si l'utilisateur est déjà verrouillé sur une commande
    if (userStates.has(senderId) && userStates.get(senderId).lockedCommand) {
      const lockedCommand = userStates.get(senderId).lockedCommand;
      const lockedCommandInstance = commands.get(lockedCommand);
      if (lockedCommandInstance) {
        return await lockedCommandInstance.execute(senderId, args, pageAccessToken, sendMessage);
      }
    } else {
      // Sinon, traiter comme texte générique ou commande non reconnue
      await sendMessage(senderId, { text: "Je n'ai pas pu traiter votre demande. Essayez une commande valide ou tapez 'help'." }, pageAccessToken);
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
      // Sauvegarder les résultats de l'analyse dans l'état de l'utilisateur pour discussion ultérieure
      userStates.set(senderId, { awaitingImagePrompt: false, analysisResults: imageAnalysis });
      await sendMessage(senderId, { text: `📄 Résultat de l'analyse :\n${imageAnalysis}` }, pageAccessToken);
      await sendMessage(senderId, { text: "Posez des questions supplémentaires pour en savoir plus sur l'image." }, pageAccessToken);
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

// Fonction pour répondre aux questions basées sur l'analyse de l'image
function analyzeImageDiscussion(analysisResults, question) {
  // Répondre à l'utilisateur en fonction des résultats de l'analyse
  // Par exemple, vous pouvez rechercher dans l'analyse et répondre dynamiquement
  if (analysisResults.includes(question)) {
    return `Voici la réponse basée sur l'analyse : ${analysisResults}`;
  } else {
    return "Je n'ai pas trouvé d'information précise pour cette question, mais je peux vous aider à explorer l'analyse en détail!";
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

module.exports = { handleMessage };
