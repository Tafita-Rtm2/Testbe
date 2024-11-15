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
𝙲𝚘𝚖𝚖𝚊𝚗𝚍 𝙽𝚊𝚖𝚎: ${command.name}
𝙳𝚎𝚜𝚌𝚛𝚒𝚙𝚝𝚒𝚘𝚗: ${command.description}
𝚄𝚜𝚊𝚐𝚎: ${command.usage || 'Non spécifié'}
━━━━━━━━━━━━━━`;

          sendMessage(senderId, { text: commandDetails }, pageAccessToken);
        } else {
          sendMessage(senderId, { text: `La commande "${commandName}" est introuvable.` }, pageAccessToken);
        }
        return;
      }

      // Affiche la liste de toutes les commandes
      const commands = commandFiles.map(file => {
        const command = require(path.join(commandsDir, file));

        // Vérifie que chaque commande a un nom et une description
        if (!command.name || !command.description) {
          return `❌ La commande dans le fichier ${file} est invalide.`;
        }

        return `│ - ${command.name} : ${command.description}`;
      });

      const helpMessage = `
━━━━━━━━━━━━━━
𝙰𝚟𝚊𝚒𝚕𝚊𝚋𝚕𝚎 𝙲𝚘𝚖𝚖𝚊𝚗𝚍𝚎𝚜:
╭─╼━━━━━━━━╾─╮
${commands.join('\n')}
╰─━━━━━━━━━╾─╯
Utilisez "help [nom de la commande]" pour voir les détails d'une commande spécifique.
━━━━━━━━━━━━━━`;

      sendMessage(senderId, { text: helpMessage }, pageAccessToken);
      
    } catch (error) {
      console.error('Erreur lors de l\'exécution de la commande help:', error);
      sendMessage(senderId, { text: 'Une erreur est survenue lors de l\'affichage des commandes.' }, pageAccessToken);
    }
  }
};
