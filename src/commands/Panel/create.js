const { EmbedBuilder, ApplicationCommandOptionType } = require("discord.js");
const api = require("../../structures/Ptero");
const settings = require("../../../settings");

const bannedUsers = ["1332006483600347157"];
const PREMIUM_ROLE_ID = process.env.PREMIUM_ROLE_ID || "1382653463904915569";

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
const whitelistedServerSet = new Set(whitelistedServers);

const tiers = [
  { name: "Premium", cpu: 150, memory: 1024, disk: 2048, max: 5 },
  { name: "Free", cpu: 50, memory: 512, disk: 1024, max: 45 },
];

const eggProfiles = {
  nodejs: {
    label: "Node.js",
    match: /(node[\s._-]*js|javascript)/i,
    defaults: {
      USER_UPLOAD: "0",
      MAIN_FILE: "index.js",
      AUTO_UPDATE: "1",
      STARTUP_CMD: "npm start",
    },
  },
  lavalink: {
    label: "Lavalink",
    match: /(lava[\s._-]*link|lavalink)/i,
    defaults: {
      USER_UPLOAD: "0",
      SERVER_PORT: "25565",
      AUTO_UPDATE: "1",
      STARTUP_CMD: "java -jar Lavalink.jar",
    },
  },
};

const eggChoices = Object.entries(eggProfiles).map(([value, profile]) => ({
  name: profile.label,
  value,
}));

const eggTemplateCache = new Map();
const panelEggNamesCache = {
  expiresAt: 0,
  names: [],
};

function isPremiumMember(context) {
  return Boolean(context.member?.roles?.cache?.has(PREMIUM_ROLE_ID));
}

function getTotalPages(meta) {
  return Number(meta?.pagination?.total_pages || 1);
}

async function fetchAllPages(fetchPage) {
  const results = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await fetchPage(page);
    const rows = response.data?.data || [];
    results.push(...rows);
    totalPages = getTotalPages(response.data?.meta);
    page++;
  }

  return results;
}

function buildEnvironment(variables, defaults) {
  const env = {};

  for (const variable of variables) {
    const attrs = variable.attributes || {};
    const key = attrs.env_variable;
    if (!key) continue;

    if (Object.prototype.hasOwnProperty.call(defaults, key)) {
      env[key] = defaults[key];
      continue;
    }

    if (attrs.default_value !== null && attrs.default_value !== undefined) {
      env[key] = String(attrs.default_value);
      continue;
    }

    env[key] = "";
  }

  return env;
}

function eggMatchesProfile(candidate, profile) {
  const attrs = candidate.attributes || {};
  const searchable = [
    attrs.name,
    attrs.description,
    attrs.docker_image,
    attrs.startup,
  ]
    .filter(Boolean)
    .join(" ");

  return profile.match.test(searchable);
}

async function listPanelEggNames(limit = 15) {
  const now = Date.now();
  if (panelEggNamesCache.expiresAt > now) {
    return panelEggNamesCache.names.slice(0, limit);
  }

  const names = [];
  const nests = await fetchAllPages((page) =>
    api.get(`/nests?page=${page}&per_page=100`),
  );

  for (const nest of nests) {
    const nestId = nest.attributes.id;
    const nestEggs = await fetchAllPages((page) =>
      api.get(`/nests/${nestId}/eggs?page=${page}&per_page=100`),
    );

    for (const candidate of nestEggs) {
      const name = candidate.attributes?.name;
      if (name) names.push(name);
    }
  }

  const uniqueNames = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  panelEggNamesCache.names = uniqueNames;
  panelEggNamesCache.expiresAt = now + 2 * 60 * 1000;

  return uniqueNames.slice(0, limit);
}

async function resolveEggTemplate(eggKey) {
  if (eggTemplateCache.has(eggKey)) {
    return eggTemplateCache.get(eggKey);
  }

  const profile = eggProfiles[eggKey];
  if (!profile) return null;

  const nests = await fetchAllPages((page) =>
    api.get(`/nests?page=${page}&per_page=100`),
  );

  for (const nest of nests) {
    const nestId = nest.attributes.id;
    const nestEggs = await fetchAllPages((page) =>
      api.get(`/nests/${nestId}/eggs?page=${page}&per_page=100`),
    );

    const matchedEgg = nestEggs.find((candidate) =>
      eggMatchesProfile(candidate, profile),
    );

    if (matchedEgg) {
      const eggId = matchedEgg.attributes.id;
      const eggDetails = await api.get(
        `/nests/${nestId}/eggs/${eggId}?include=variables`,
      );
      const attributes = eggDetails.data?.attributes || matchedEgg.attributes;
      const variables =
        eggDetails.data?.attributes?.relationships?.variables?.data ||
        eggDetails.data?.relationships?.variables?.data ||
        [];

      const resolved = {
        id: attributes.id,
        nest: nestId,
        name: attributes.name || profile.label,
        docker_image: attributes.docker_image,
        startup: attributes.startup,
        environment: buildEnvironment(variables, profile.defaults),
      };

      eggTemplateCache.set(eggKey, resolved);
      return resolved;
    }
  }

  return null;
}

async function getUserByDiscordId(discordId) {
  try {
    const res = await api.get("/users", {
      params: {
        filter: discordId,
        per_page: 100,
      },
    });

    const matched = (res.data?.data || []).find(
      (u) => u.attributes.username === discordId,
    );
    if (matched) return matched;
  } catch (err) {
    console.error(
      "Fast user lookup failed, falling back to pagination:",
      err.message || err,
    );
  }

  const users = await fetchAllPages((page) =>
    api.get(`/users?page=${page}&per_page=100`),
  );

  const foundUser = users.find((u) => u.attributes.username === discordId);
  if (foundUser) return foundUser;

  return null;
}

async function getServerStatsForUser(userId) {
  const usage = { Premium: 0, Free: 0 };
  let hasServer = false;

  const servers = await fetchAllPages((page) =>
    api.get(`/servers?page=${page}&per_page=100`),
  );

  for (const s of servers) {
    const uuid = s.attributes.uuid;
    if (whitelistedServerSet.has(uuid)) continue;

    if (s.attributes.user === userId) {
      hasServer = true;
    }

    const { cpu, memory, disk } = s.attributes.limits;
    for (const tier of tiers) {
      if (cpu === tier.cpu && memory === tier.memory && disk === tier.disk) {
        usage[tier.name]++;
        break;
      }
    }
  }

  return { usage, hasServer };
}

module.exports = {
  name: "create",
  description: "Create a server from available free slots",
  options: [
    {
      name: "egg",
      description: "Choose server type (Node.js, Lavalink)",
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: eggChoices,
    },
    {
      name: "servername",
      description: "Name your server",
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],

  run: async ({ client, context }) => {
    const discordId = context.user.id;

    if (bannedUsers.includes(discordId)) {
      return context.createMessage({
        content: "🚫 You are banned from creating new servers.",
      });
    }

    const eggKey = context.options.getString("egg");
    const serverName = context.options.getString("servername");
    if (!eggProfiles[eggKey])
      return context.createMessage({ content: "❌ Invalid egg selection." });

    let egg;
    let pteroUser;
    try {
      [egg, pteroUser] = await Promise.all([
        resolveEggTemplate(eggKey),
        getUserByDiscordId(discordId),
      ]);
    } catch (err) {
      console.error(
        "Error resolving create dependencies:",
        err.response?.data || err,
      );
      return context.createMessage({
        content:
          "❌ Failed to validate server template with panel. Please try again later.",
      });
    }

    if (!egg) {
      let availableEggs = [];
      try {
        availableEggs = await listPanelEggNames();
      } catch (scanError) {
        console.error(
          "Failed to list panel eggs for diagnostics:",
          scanError.response?.data || scanError.message || scanError,
        );
      }

      const availableSuffix = availableEggs.length
        ? `\nDetected eggs: ${availableEggs.join(", ")}`
        : "";

      return context.createMessage({
        content: `❌ Selected server template is not available on the panel.${availableSuffix}`,
      });
    }

    if (!pteroUser) {
      return context.createMessage({
        content: "❌ No Pterodactyl user linked. Please register first.",
      });
    }

    const { usage: tierUsage, hasServer } = await getServerStatsForUser(
      pteroUser.attributes.id,
    );
    if (hasServer) {
      return context.createMessage({
        content:
          "⚠️ You already own a server. You can only have one server per account.",
      });
    }

    const premiumUser = isPremiumMember(context);
    const candidateTiers = premiumUser
      ? tiers
      : tiers.filter((tier) => tier.name === "Free");

    let selectedTier = null;
    for (const tier of candidateTiers) {
      if (tierUsage[tier.name] < tier.max) {
        selectedTier = tier;
        break;
      }
    }

    if (!selectedTier) {
      const fullTierMessage = premiumUser
        ? "⚠️ All tier slots are currently full. Please try again later."
        : "⚠️ Free tier slots are currently full. Please try again later.";

      return context.createMessage({
        content: fullTierMessage,
      });
    }

    try {
      const res = await api.post("/servers", {
        name: serverName,
        user: pteroUser.attributes.id,
        nest: egg.nest,
        egg: egg.id,
        docker_image: egg.docker_image,
        startup: egg.startup,
        environment: egg.environment,
        limits: {
          memory: selectedTier.memory,
          swap: 0,
          disk: selectedTier.disk,
          io: 500,
          cpu: selectedTier.cpu,
          oom_disabled: false,
        },
        feature_limits: {
          databases: 0,
          backups: 1,
          allocations: 1,
        },
        deploy: {
          locations: [1],
          dedicated_ip: false,
          port_range: [],
        },
        start_on_completion: true,
      });

      return context.createMessage({
        embeds: [
          new EmbedBuilder()
            .setColor("Green")
            .setTitle("✅ Server Created")
            .setDescription(
              `🖥️ **Name:** \`${serverName}\`\n🍳 **Type:** \`${egg.name}\`\n📦 **Tier:** \`${selectedTier.name}\`\n🔗 [View on Panel](${settings.ptero.url}/server/${res.data.attributes.identifier})`,
            ),
        ],
      });
    } catch (err) {
      console.error("Error creating server:", {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message,
      });
      return context.createMessage({
        content: "❌ Failed to create server. Please try again later.",
      });
    }
  },
};
