const { ownerId } = require("../../../settings");
const api = require("../../structures/Ptero");

const whitelistedServers = [
  "c47c3ff8-7076-449d-961e-ca1b3f3c0ca3",
  "702f85a2-6dea-4ac8-bf76-c2cd48567594",
  "155da30d-d69e-488c-b43b-736e983ea9f4",
  "1bc089ff-1355-4187-8c86-3a918636cf06",
  "6df028d4-975f-4efb-83d1-2c8e613c10a4",
  "3d64f61d-be76-4f83-a5c2-26112dc8f897",
  "151f6d76-04ba-422e-abc8-d80588151e59",
  "25b9f9a2-703c-41ff-a9de-6574187af462",
];
module.exports = {
  name: "deleteall",
  description: "Deletes all servers excluding whitelisted ones (Owner only)",
  run: async ({ context }) => {
    if (context.user.id !== ownerId) {
      return context.createMessage({
        content: "🚫 You are not authorized to use this command.",
        flags: 64,
      });
    }

    // Inform the user that deletion is starting
    await context.createMessage({
      content: "⏳ Deletion process started... Please wait.",
      flags: 64,
    });

    let page = 1;
    let deleted = 0;
    let skipped = 0;

    try {
      while (true) {
        const res = await api.get(`/servers?page=${page}&per_page=100`);
        const servers = res.data.data || [];
        if (servers.length === 0) break;

        for (const s of servers) {
          const uuid = s.attributes.uuid;
          if (whitelistedServers.includes(uuid)) {
            skipped++;
            continue;
          }

          try {
            await api.delete(`/servers/${s.attributes.id}/force`);
            deleted++;
          } catch (err) {
            console.error(
              `❌ Failed to delete server ${uuid}`,
              err?.response?.data || err,
            );
          }
        }

        page++;
      }

      return context.createMessage({
        content: `✅ **Deletion complete!**\n\n🗑️ Deleted: **${deleted} servers**\n❎ Skipped: **${skipped} (whitelisted)**`,
        flags: 64,
      });
    } catch (err) {
      console.error("❌ Error during deleteAll:", err?.response?.data || err);
      return context.createMessage({
        content: "❌ An unexpected error occurred during the deletion process.",
        flags: 64,
      });
    }
  },
};
