export const SUPPORTED_PLATFORMS = [
  {
    id: "instagram",
    label: "Instagram",
    sector: "Saved media",
    hosts: ["www.instagram.com", "instagram.com"],
    kind: "media"
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    sector: "Chats",
    hosts: ["web.whatsapp.com", "whatsapp.com"],
    kind: "chat"
  },
  {
    id: "slack",
    label: "Slack",
    sector: "Work chat",
    hosts: ["app.slack.com", "slack.com"],
    kind: "chat"
  },
  {
    id: "discord",
    label: "Discord",
    sector: "Communities",
    hosts: ["discord.com", "discordapp.com"],
    kind: "chat"
  },
  {
    id: "telegram",
    label: "Telegram",
    sector: "Chats",
    hosts: ["web.telegram.org", "telegram.org"],
    kind: "chat"
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    sector: "Professional feed",
    hosts: ["www.linkedin.com", "linkedin.com"],
    kind: "feed"
  },
  {
    id: "reddit",
    label: "Reddit",
    sector: "Forums",
    hosts: ["www.reddit.com", "reddit.com"],
    kind: "feed"
  }
];

export const PLATFORM_BY_ID = Object.fromEntries(
  SUPPORTED_PLATFORMS.map((platform) => [platform.id, platform])
);

export const PLATFORM_HOSTS = Object.fromEntries(
  SUPPORTED_PLATFORMS.map((platform) => [platform.id, platform.hosts])
);

export function getPlatformByHost(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return SUPPORTED_PLATFORMS.find((platform) =>
    platform.hosts.some((host) => normalized === host || normalized.endsWith(`.${host}`))
  ) || null;
}

export function makePlatformId(platform, seed) {
  return `${platform}:${slugify(seed)}`;
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
