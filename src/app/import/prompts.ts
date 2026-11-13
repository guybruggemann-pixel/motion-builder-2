/** Ready-made prompts for the Import prompt bar, written in the motion directory's vocabulary (characters, spring feels, reveals, splits). */
export const STARTER_PROMPTS = [
  { label: "Calm rise", prompt: "Calm and elegant: each layer drifts up 30px and fades in, one after another, smooth outQuart easing." },
  { label: "Punchy wipes", prompt: "Punchy and fast: panels wipe open left to right with outExpo, the headline slams in word by word." },
  { label: "Bouncy springs", prompt: "Playful: everything springs in with the Bouncy spring feel and a little overshoot in scale." },
  { label: "Typewriter", prompt: "Typewriter: the headline types on letter by letter with steps, the subline fades up after it." },
  { label: "Mask reveal", prompt: "Mask reveal: the panel wipes open, then the text rises out of it with an upward reveal, snappy timing." },
  { label: "Scale pop", prompt: "Scale pop: layers pop in from 60% with the Snappy spring feel, quick stagger between them." },
  { label: "Focus pull", prompt: "Focus pull: layers sharpen from a soft blur while fading in, slow inOutSine, cinematic." },
  { label: "Centre cascade", prompt: "Centre cascade: the headline's letters fan out from the centre with the Gentle spring feel." },
] as const;
