const { EmbedBuilder, MessageFlags } = require("discord.js");
const User = require("../../models/User");
const PendingUser = require("../../models/PendingUser");
const api = require("../../structures/Ptero");
const { ptero } = require("../../../settings");
const crypto = require("crypto");
const sendEmail = require("../../structures/sendVerificationEmail");
const cooldowns = new Map(); // userId => timestamp

function generatePassword(length = 12) {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
  let password = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  return password;
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

module.exports = {
  name: "register",
  description: "Register a new panel account (one-time only)",
  options: [
    {
      name: "email",
      description: "Your email address",
      type: 3,
      required: true,
    },
  ],

  run: async ({ client, context }) => {
    const discordId = context.user.id;
    const now = Date.now();
    const cooldownTime = 5 * 60 * 1000; // 5 minutes

    if (cooldowns.has(discordId)) {
      const lastUsed = cooldowns.get(discordId);
      if (now - lastUsed < cooldownTime) {
        const remaining = Math.ceil((cooldownTime - (now - lastUsed)) / 1000);
        return context.createMessage({
          content: `⏳ Please wait ${Math.ceil(remaining / 60)} minute(s) before using \`/register\` again.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    const bannedMembers = await User.find({ isBanned: true })
      .select("discordId")
      .lean();

    if (bannedMembers.some((member) => member.discordId === discordId)) {
      return context.createMessage({
        content: "❌ You are banned from creating an account.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // const channel = await client.channels.fetch(context.channelId);
    // const allowedCategoryId = "1375517232733618227";

    // if (!channel || channel.parentId !== allowedCategoryId) {
    //   return context.createMessage({
    //     content: "❌ You can only use this command in a ticket channel.",
    //     flags: MessageFlags.Ephemeral,
    //   });
    // }

    const email = context.options.getString("email");

    if (!isValidEmail(email)) {
      return context.createMessage({
        content: "❌ Please provide a valid email address.",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const existing = await User.findOne({ discordId });

      if (existing) {
        try {
          const panelUser = await api.get(`/users/${existing.pteroId}`);
          if (panelUser?.data?.object === "user") {
            return context.createMessage({
              content: "❌ You have already registered an account.",
              flags: MessageFlags.Ephemeral,
            });
          } else {
            await User.deleteOne({ discordId });
          }
        } catch (err) {
          if (err.response?.status === 404) {
            await User.deleteOne({ discordId });
          } else {
            console.error("Error checking panel user:", err);
            return context.createMessage({
              content:
                "⚠️ Unexpected error verifying your account. Please try again shortly.",
              flags: MessageFlags.Ephemeral,
            });
          }
        }
      }
    } catch (dbErr) {
      console.error("Database error while checking user:", dbErr);
      return context.createMessage({
        content: "⚠️ Internal error. Please try again later.",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const emailCheck = await api.get("/users", {
        searchParams: { filter: email },
      });
      const found = emailCheck.data?.data?.find(
        (u) => u.attributes.email.toLowerCase() === email.toLowerCase(),
      );

      if (found) {
        return context.createMessage({
          content:
            "❌ This email is already registered on the panel. Please use a different email.",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (err) {
      console.error("Error checking email uniqueness:", err);
      return context.createMessage({
        content:
          "⚠️ Unable to verify email. Please try again later or contact support.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    await PendingUser.deleteMany({ discordId });
    await new PendingUser({ discordId, email, code, expiresAt }).save();

    try {
      await sendEmail(email, code);
    } catch (e) {
      console.error("Email send error:", e);
      return context.createMessage({
        content:
          "❌ Failed to send verification email. Please contact support.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // ✅ Cooldown applied only if email was sent
    cooldowns.set(discordId, now);
    setTimeout(() => cooldowns.delete(discordId), cooldownTime);

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor("Blue")
          .setTitle("📧 Check Your Email")
          .setDescription(
            `A 6-digit verification code has been sent to **${email}**.\n\n` +
              `Please type the **exact 6-digit code** in this channel within 5 minutes.\n` +
              `If you do not type it in time, the registration will cancel.`,
          ),
      ],
    });

    await context.createMessage({
      content:
        "✅ Verification code sent! Check the mail and type the code you received in this channel.",
      flags: MessageFlags.Ephemeral,
    });

    if (!channel.isTextBased()) {
      return context.createMessage({
        content: "❌ Error: This command must be used in a text-based channel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const filter = (msg) =>
      msg.author.id === discordId &&
      msg.channel.id === context.channelId &&
      /^\d{6}$/.test(msg.content.trim());

    try {
      const collected = await channel.awaitMessages({
        filter,
        max: 1,
        time: 5 * 60 * 1000,
        errors: ["time"],
      });

      const replyMsg = collected.first();
      const submittedCode = replyMsg.content.trim();

      const pending = await PendingUser.findOne({ discordId });

      if (!pending || Date.now() > pending.expiresAt) {
        await replyMsg.reply(
          "❌ That code has expired. Please run `/register` again.",
        );
        await PendingUser.deleteOne({ discordId });
        return;
      }

      if (pending.code !== submittedCode) {
        await replyMsg.reply(
          "❌ Incorrect code. Registration canceled. Run `/register` again.",
        );
        await PendingUser.deleteOne({ discordId });
        return;
      }

      const password = generatePassword();
      const firstName = context.user.username;
      const lastName = "User";

      let res;
      try {
        res = await api.post("/users", {
          username: discordId,
          email,
          first_name: firstName,
          last_name: lastName,
          password,
          language: ptero.defaultLanguage,
        });
      } catch (err) {
        console.error(
          "Panel create error (API call):",
          err.response?.data || err,
        );
        await replyMsg.reply(
          "❌ Failed to create your panel account. Please try again later.",
        );
        return;
      }

      if (!res?.data?.attributes?.id) {
        console.error("Panel create error: Missing ID in response:", res?.data);
        await replyMsg.reply(
          "❌ Unexpected API response. Contact an administrator.",
        );
        return;
      }

      const pteroId = res.data.attributes.id;
      await new User({ discordId, email, pteroId }).save();
      await PendingUser.deleteOne({ discordId });

      await replyMsg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Green")
            .setTitle("✅ Account Created")
            .setDescription(
              `📧 **Email:** \`${email}\`\n` +
                `🧾 **Username:** \`${discordId}\`\n` +
                `🔑 **Password:** \`${password}\`\n\n` +
                `You can now log in at: <${ptero.url}>\n\n` +
                `> Please reset your password immediately after logging in.`,
            ),
        ],
      });
    } catch (err) {
      if (err instanceof Error && err.message === "time") {
        await channel.send(
          "⏳ Verification timed out. Please run `/register` again if you still wish to sign up.",
        );
        await PendingUser.deleteOne({ discordId });
      } else {
        console.error("Unexpected error in awaitMessages:", err);
        await channel.send(
          "❌ An unexpected error occurred. Please try again.",
        );
        await PendingUser.deleteOne({ discordId });
      }
    }
  },
};
