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

      const commands = commandFiles.map(file => {
        try {
          const command = require(path.join(commandsDir, file));

          // Vérifie que la commande a bien un nom et une description
          if (!command.name || !command.description) {
            return `❌ La commande dans le fichier ${file} est invalide.`;
          }

          return { title: command.name.toUpperCase(), payload: `HELP_${command.name.toUpperCase()}` };
        } catch (err) {
          console.error(`Erreur lors du chargement de la commande ${file}:`, err);
          return null;
        }
      }).filter(command => command !== null);

      const quickReplies = commands.slice(0, 13).map(command => ({
        content_type: 'text',
        title: command.title,
        payload: command.payload
      }));

      const helpMessage = `
╭──────✯──────╮
│🇲🇬 Commandes Disponibles 📜 
├───────♨──────
Sélectionnez une commande ci-dessous pour obtenir des détails.
│ 📌 Nombre total de commandes : ${commands.length}  │
│ 💡 Utilisez les boutons pour plus de détails ! │
╰──────✨──────╯`;

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
