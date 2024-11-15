const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'help',
  description: 'Afficher les commandes disponibles',
  author: 'System',
  execute(senderId, args, pageAccessToken, sendMessage) {
    try {
      const commandsDir = path.join(__dirname, '../commands');

      // Vérifie si le répertoire existe avant de lire son contenu
      if (!fs.existsSync(commandsDir)) {
        return sendMessage(senderId, { text: 'Le répertoire des commandes n\'existe pas.' }, pageAccessToken);
      }

      const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));

      // Vérifie s'il y a des fichiers dans le répertoire
      if (commandFiles.length === 0) {
        return sendMessage(senderId, { text: 'Aucune commande disponible.' }, pageAccessToken);
      }

      // Génère les quick replies pour chaque commande
      const quickReplies = commandFiles.map(file => {
        try {
          const command = require(path.join(commandsDir, file));

          // Vérifie que la commande a bien un nom et une description
          if (!command.name || !command.description) {
            return null; // Ignore si la commande est invalide
          }

          return {
            content_type: "text",
            title: command.name,
            payload: `HELP_${command.name.toUpperCase()}`
          };
        } catch (err) {
          console.error(`Erreur lors du chargement de la commande ${file}:`, err);
          return null;
        }
      }).filter(Boolean); // Filtre les valeurs nulles

      const totalCommands = quickReplies.length;
      const helpMessage = `🇲🇬 Commandes Disponibles 📜\n\n📌 Nombre total de commandes : ${totalCommands}\n💡 Utilisez les boutons ci-dessous pour sélectionner une commande.`;

      // Envoie le message avec des quick_replies pour chaque commande
      sendMessage(senderId, { 
        text: helpMessage,
        quick_replies: quickReplies 
      }, pageAccessToken);
    } catch (error) {
      console.error('Erreur lors de l\'exécution de la commande help:', error);
      sendMessage(senderId, { text: 'Une erreur est survenue lors de l\'affichage des commandes.' }, pageAccessToken);
    }
  }
};
