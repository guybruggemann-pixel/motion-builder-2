import arrow_right from "@/assets/library/arrow-right.png.asset.json";
import arrows_move from "@/assets/library/arrows-move.png.asset.json";
import bolt from "@/assets/library/bolt.png.asset.json";
import check from "@/assets/library/check.png.asset.json";
import circle from "@/assets/library/circle.png.asset.json";
import cloud from "@/assets/library/cloud.png.asset.json";
import code from "@/assets/library/code.png.asset.json";
import cursor_text from "@/assets/library/cursor-text.png.asset.json";
import device_desktop from "@/assets/library/device-desktop.png.asset.json";
import diamond from "@/assets/library/diamond.png.asset.json";
import eye from "@/assets/library/eye.png.asset.json";
import heart from "@/assets/library/heart.png.asset.json";
import hexagon from "@/assets/library/hexagon.png.asset.json";
import layers_intersect from "@/assets/library/layers-intersect.png.asset.json";
import leaf from "@/assets/library/leaf.png.asset.json";
import mail from "@/assets/library/mail.png.asset.json";
import message_circle from "@/assets/library/message-circle.png.asset.json";
import player_play from "@/assets/library/player-play.png.asset.json";
import rocket from "@/assets/library/rocket.png.asset.json";
import sparkles from "@/assets/library/sparkles.png.asset.json";
import star from "@/assets/library/star.png.asset.json";
import sun from "@/assets/library/sun.png.asset.json";
import target from "@/assets/library/target.png.asset.json";
import world from "@/assets/library/world.png.asset.json";
import paper from "@/assets/library/paper-grain.jpg";
import ink from "@/assets/library/ink-distress.jpg";

export interface CuratedAsset {
  id: string; name: string; category: "icons" | "textures"; src: string;
  width: number; height: number; source: string; license: string; sourceUrl?: string; tags: string;
}

export const CURATED_ASSETS: CuratedAsset[] = [
  { id: "tabler-arrow-right", name: "Arrow Right", category: "icons", src: arrow_right.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "arrow right" },
  { id: "tabler-arrows-move", name: "Arrows Move", category: "icons", src: arrows_move.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "arrows move" },
  { id: "tabler-bolt", name: "Bolt", category: "icons", src: bolt.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "bolt" },
  { id: "tabler-check", name: "Check", category: "icons", src: check.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "check" },
  { id: "tabler-circle", name: "Circle", category: "icons", src: circle.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "circle" },
  { id: "tabler-cloud", name: "Cloud", category: "icons", src: cloud.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "cloud" },
  { id: "tabler-code", name: "Code", category: "icons", src: code.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "code" },
  { id: "tabler-cursor-text", name: "Cursor Text", category: "icons", src: cursor_text.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "cursor text" },
  { id: "tabler-device-desktop", name: "Device Desktop", category: "icons", src: device_desktop.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "device desktop" },
  { id: "tabler-diamond", name: "Diamond", category: "icons", src: diamond.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "diamond" },
  { id: "tabler-eye", name: "Eye", category: "icons", src: eye.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "eye" },
  { id: "tabler-heart", name: "Heart", category: "icons", src: heart.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "heart" },
  { id: "tabler-hexagon", name: "Hexagon", category: "icons", src: hexagon.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "hexagon" },
  { id: "tabler-layers-intersect", name: "Layers Intersect", category: "icons", src: layers_intersect.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "layers intersect" },
  { id: "tabler-leaf", name: "Leaf", category: "icons", src: leaf.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "leaf" },
  { id: "tabler-mail", name: "Mail", category: "icons", src: mail.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "mail" },
  { id: "tabler-message-circle", name: "Message Circle", category: "icons", src: message_circle.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "message circle" },
  { id: "tabler-player-play", name: "Player Play", category: "icons", src: player_play.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "player play" },
  { id: "tabler-rocket", name: "Rocket", category: "icons", src: rocket.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "rocket" },
  { id: "tabler-sparkles", name: "Sparkles", category: "icons", src: sparkles.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "sparkles" },
  { id: "tabler-star", name: "Star", category: "icons", src: star.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "star" },
  { id: "tabler-sun", name: "Sun", category: "icons", src: sun.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "sun" },
  { id: "tabler-target", name: "Target", category: "icons", src: target.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "target" },
  { id: "tabler-world", name: "World", category: "icons", src: world.url, width: 512, height: 512, source: "Tabler Icons", license: "MIT", sourceUrl: "https://github.com/tabler/tabler-icons", tags: "world" },
  { id: "paper-grain", name: "Paper grain", category: "textures", src: paper, width: 1024, height: 1024, source: "Generated artwork", license: "Generated", tags: "paper grain white fibers background" },
  { id: "ink-distress", name: "Ink distress", category: "textures", src: ink, width: 1024, height: 1024, source: "Generated artwork", license: "Generated", tags: "ink distress grunge scratches background" },
];
