const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'menu',
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

      const commands = [];
      const quickReplies = commandFiles.map(file => {
        try {
          const command = require(path.join(commandsDir, file));

          // Vérifie que la commande a bien un nom
          if (!command.name) {
            commands.push(`❌ La commande dans le fichier ${file} est invalide.`);
            return null;
          }

          // Formatage des commandes pour l'affichage sans description
          commands.push(`╟ ${command.name.toUpperCase()}`);

          // Création d'un bouton Quick Reply pour chaque commande
          return {
            content_type: 'text',
            title: command.name,
            payload: `HELP_${command.name.toUpperCase()}`
          };
        } catch (err) {
          console.error(`Erreur lors du chargement de la commande ${file}:`, err);
          commands.push(`❌ Erreur lors du chargement de la commande ${file}.`);
          return null;
        }
      }).filter(Boolean); // Filtre les valeurs nulles

      const helpMessage = `
╔══════════════╗
║ 📜 Commandes Disponibles ║
╟──────────────╢
╟${commands.join('\n╟─────────────\n')}
╚══════════════╝
💡 Nombre total de commandes : ${commandFiles.length}`;

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
