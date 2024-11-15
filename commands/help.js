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

      if (args.length > 0) {
        // Affiche les détails d'une commande spécifique si un argument est donné
        const commandName = args[0].toLowerCase();
        const commandFile = commandFiles.find(file => {
          const command = require(path.join(commandsDir, file));
          return command.name.toLowerCase() === commandName;
        });

        if (commandFile) {
          const command = require(path.join(commandsDir, commandFile));
          const commandDetails = `
━━━━━━━━━━━━━━
Command Name: ${command.name}
Description: ${command.description || 'Non spécifié'}
Usage: ${command.usage || 'Non spécifié'}
━━━━━━━━━━━━━━`;

          sendMessage(senderId, { text: commandDetails }, pageAccessToken);
        } else {
          sendMessage(senderId, { text: `La commande "${commandName}" est introuvable.` }, pageAccessToken);
        }
        return;
      }

      // Liste tous les noms de commandes uniquement
      const commandsList = commandFiles.map(file => {
        const command = require(path.join(commandsDir, file));
        return `- ${command.name}`;
      }).join('\n');

      const helpMessage = `
Available Commands:
╭───────────────────╮
${commandsList}
╰───────────────────╯
Chat -help [name]
to see command details.`;

      // Crée les Quick Replies pour chaque commande
      const quickReplies = commandFiles.map(file => {
        const command = require(path.join(commandsDir, file));
        return {
          content_type: 'text',
          title: command.name,
          payload: `HELP_${command.name.toUpperCase()}`
        };
      });

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
