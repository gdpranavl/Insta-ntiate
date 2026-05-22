import { getAppOrigin } from "@/lib/config";

export default function manifest() {
  const origin = getAppOrigin();
  return {
    name: "Insta-ntiate",
    short_name: "Insta-ntiate",
    description: "Your personal, searchable archive of saved Instagram posts and reels.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable"
      }
    ],
    share_target: {
      action: "/api/share",
      method: "POST",
      enctype: "application/x-www-form-urlencoded",
      params: {
        title: "title",
        text: "text",
        url: "url"
      }
    },
    shortcuts: [
      {
        name: "Rediscover",
        short_name: "Rediscover",
        description: "Surface a random saved post",
        url: "/?rediscover=1"
      }
    ]
  };
}
