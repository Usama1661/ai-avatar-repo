import type { BlendshapeWeights } from '../model/blendshapes';
import { VISEME_BLENDSHAPES, type VisemeCue, type VisemeId } from '../model/visemes';

/**
 * Phone voices do not report phoneme times. These cues follow the spelling of
 * each word — vowels open, closures shut — and then rest. They do not repeat.
 */
const VOWEL_SEC = 0.12;
const CLOSURE_SEC = 0.07;
const HOLD_SEC = 0.09;
const WORD_GAP_SEC = 0.07;
const PAUSE_SEC = 0.18;

type Token = { viseme: VisemeId; duration: number; weight: number };

export function approximateMouthCues(text: string): VisemeCue[] {
  const tokens = tokensFor(text);
  const cues: VisemeCue[] = [];
  let time = 0;
  for (const token of tokens) {
    cues.push({ time, viseme: token.viseme, weight: token.weight });
    time += token.duration;
  }
  if (cues.length === 0) cues.push({ time: 0, viseme: 'sil', weight: 1 });
  return cues;
}

export function mouthWeightsAt(cues: VisemeCue[], elapsedSec: number): BlendshapeWeights {
  if (cues.length === 0 || elapsedSec < 0) return {};
  const end = cues[cues.length - 1].time + HOLD_SEC;
  if (elapsedSec >= end) return {};

  let index = 0;
  while (index < cues.length - 1 && cues[index + 1].time <= elapsedSec) index += 1;

  const current = cues[index];
  const next = cues[index + 1];
  const currentWeights = scale(VISEME_BLENDSHAPES[current.viseme], current.weight);
  if (!next) return currentWeights;

  const span = Math.max(0.001, next.time - current.time);
  const blend = smoothstep(Math.min(1, Math.max(0, (elapsedSec - current.time) / span)));
  return mix(currentWeights, scale(VISEME_BLENDSHAPES[next.viseme], next.weight), blend);
}

function tokensFor(text: string): Token[] {
  const tokens: Token[] = [];
  const words = text.toLowerCase().match(/[a-z']+|[^a-z\s]+|\s+/g) ?? [];
  for (const word of words) {
    if (/^\s+$/.test(word)) {
      tokens.push({ viseme: 'sil', duration: WORD_GAP_SEC, weight: 1 });
      continue;
    }
    if (/^[^a-z']+$/.test(word)) {
      tokens.push({ viseme: 'sil', duration: /[.!?]/.test(word) ? PAUSE_SEC : WORD_GAP_SEC, weight: 1 });
      continue;
    }
    tokens.push(...spellWord(word.replace(/'/g, '')));
  }
  return tokens;
}

function spellWord(word: string): Token[] {
  const tokens: Token[] = [];
  const letters = word.split('');
  for (let i = 0; i < letters.length; i += 1) {
    if (letters[i] === 'e' && i === letters.length - 1 && i > 1 && !isVowel(letters[i - 1])) continue;

    const pair = letters[i] + (letters[i + 1] ?? '');
    const triple = pair + (letters[i + 2] ?? '');
    const matched = matchCluster(triple, pair, letters[i], letters[i + 1]);
    tokens.push(matched.token);
    i += matched.consumed - 1;
  }
  return tokens;
}

function matchCluster(
  triple: string,
  pair: string,
  char: string,
  next: string | undefined,
): { token: Token; consumed: number } {
  if (triple === 'igh') return { token: vowel('ih'), consumed: 3 };
  if (pair === 'th') return { token: shape('TH', HOLD_SEC, 0.85), consumed: 2 };
  if (pair === 'sh' || pair === 'ch') return { token: shape('CH', HOLD_SEC, 0.9), consumed: 2 };
  if (pair === 'ph') return { token: shape('FF', HOLD_SEC, 0.85), consumed: 2 };
  if (pair === 'wh') return { token: shape('RR', HOLD_SEC, 0.7), consumed: 2 };
  if (pair === 'qu') return { token: shape('kk', CLOSURE_SEC, 0.8), consumed: 2 };
  if (pair === 'oo' || pair === 'ou' || pair === 'ew') return { token: vowel('ou'), consumed: 2 };
  if (pair === 'ee' || pair === 'ea' || pair === 'ie') return { token: vowel('E'), consumed: 2 };
  if (pair === 'ai' || pair === 'ay' || pair === 'ei') return { token: vowel('E'), consumed: 2 };
  if (pair === 'oa' || pair === 'ow') return { token: vowel('oh'), consumed: 2 };
  if (pair === 'oi' || pair === 'oy') return { token: vowel('oh'), consumed: 2 };
  if (pair === 'au' || pair === 'aw') return { token: vowel('oh'), consumed: 2 };
  if (char === next && !isVowel(char)) return { token: consonant(char), consumed: 2 };
  if (char === 'c' && next !== undefined && 'eiy'.includes(next)) return { token: shape('SS', HOLD_SEC, 0.8), consumed: 1 };
  if (char === 'c') return { token: shape('kk', CLOSURE_SEC, 0.75), consumed: 1 };
  return { token: isVowel(char) ? vowel(vowelFor(char)) : consonant(char), consumed: 1 };
}

function vowel(viseme: VisemeId): Token {
  return { viseme, duration: VOWEL_SEC, weight: 1 };
}

function shape(viseme: VisemeId, duration: number, weight: number): Token {
  return { viseme, duration, weight };
}

function vowelFor(char: string): VisemeId {
  if (char === 'a') return 'aa';
  if (char === 'e') return 'E';
  if (char === 'i') return 'ih';
  if (char === 'o') return 'oh';
  return 'ou';
}

function consonant(char: string): Token {
  if ('mbp'.includes(char)) return shape('PP', CLOSURE_SEC, 1);
  if ('fv'.includes(char)) return shape('FF', HOLD_SEC, 0.85);
  if (char === 's' || char === 'z' || char === 'x') return shape('SS', HOLD_SEC, 0.8);
  if ('kgq'.includes(char)) return shape('kk', CLOSURE_SEC, 0.75);
  if (char === 'n') return shape('nn', HOLD_SEC, 0.7);
  if (char === 'r' || char === 'w' || char === 'y') return shape('RR', HOLD_SEC, 0.75);
  if (char === 'h') return shape('sil', 0.04, 1);
  if (char === 'l' || char === 't' || char === 'd') return shape('DD', CLOSURE_SEC, 0.8);
  return shape('DD', CLOSURE_SEC, 0.65);
}

function isVowel(char: string | undefined): boolean {
  return char !== undefined && 'aeiou'.includes(char);
}

function scale(weights: BlendshapeWeights, amount: number): BlendshapeWeights {
  const scaled: BlendshapeWeights = {};
  for (const [name, weight] of Object.entries(weights)) {
    scaled[name as keyof BlendshapeWeights] = (weight ?? 0) * amount;
  }
  return scaled;
}

function mix(a: BlendshapeWeights, b: BlendshapeWeights, t: number): BlendshapeWeights {
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  const mixed: BlendshapeWeights = {};
  for (const name of names) {
    const key = name as keyof BlendshapeWeights;
    const from = a[key] ?? 0;
    const to = b[key] ?? 0;
    mixed[key] = from + (to - from) * t;
  }
  return mixed;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
