const dotenv = require("dotenv");
dotenv.config();

module.exports = {
  productName: process.env.PRODUCT_NAME, // Product name for email templates
  TOKEN: process.env.TOKEN, // Discord bot token
  CLIENT_ID: process.env.CLIENT_ID, // Discord bot client ID
  CLIENT_SECRET: process.env.CLIENT_SECRET, // Discord bot client secret

  BOT_PREFIX: process.env.BOT_PREFIX, // Bot command prefix
  BOT_ACTIVITY: process.env.BOT_ACTIVITY, // Bot activity status
  BOT_ACTIVITY_TYPE: process.env.BOT_ACTIVITY_TYPE, // Bot activity type (WATCHING, LISTENING, PLAYING, STREAMING)

  mongodb: process.env.MONGO_URI, // MongoDB connection string

  ownerId: process.env.BOT_OWNER_ID, // Discord user ID of the bot owner (Admin)

  ticketcategoryid: process.env.TICKET_CATEGORY_ID, // Discord category ID for ticket channels

  ptero: {
    url: process.env.PTERODACTYL_URL, // Pterodactyl panel URL
    apiKey: process.env.PTERODACTYL_API_KEY, // Pterodactyl API key ( Admin key )
    defaultLanguage: "en", // Do not change this
    clientApiKey: process.env.PTERODACTYL_CLIENT_API_KEY, // Pterodactyl client API key ( Admin key )
  },
};
