import type { BlendshapeWeights } from '../model/blendshapes';
import { VISEME_BLENDSHAPES, type VisemeCue, type VisemeId } from '../model/visemes';

/**
 * Phone voices do not report phoneme times. We build a phoneme schedule from
 * spelling, then retarget it to real speech using word-boundary events from
 * expo-speech so the mouth stays locked to the spoken words.
 */
const VOWEL_SEC = 0.12;
const CLOSURE_SEC = 0.06;
const HOLD_SEC = 0.05;
const WORD_GAP_SEC = 0.04;
const PAUSE_SEC = 0.12;

/** Whole words whose spelling does not match the mouth shape. */
const WORDS: Record<string, ReadonlyArray<readonly [VisemeId, number]>> = {
  a: [['aa', 0.35]],
  i: [['aa', 1], ['ih', 0.65]],
  you: [['ou', 1]],
  your: [['ou', 0.9], ['RR', 0.45]],
  the: [['TH', 0.9], ['aa', 0.28]],
  to: [['DD', 0.65], ['ou', 0.75]],
  too: [['DD', 0.6], ['ou', 1]],
  hello: [['E', 0.9], ['DD', 0.55], ['oh', 1]],
  hi: [['aa', 0.9], ['ih', 0.7]],
  how: [['aa', 1], ['ou', 0.55]],
  can: [['kk', 0.75], ['aa', 0.8], ['nn', 0.75]],
  help: [['E', 1], ['DD', 0.5], ['PP', 1]],
  today: [['DD', 0.7], ['aa', 0.3], ['DD', 0.65], ['E', 0.95]],
  what: [['RR', 0.7], ['aa', 0.55], ['DD', 0.6]],
  is: [['ih', 0.7], ['SS', 0.85]],
  this: [['TH', 0.85], ['ih', 0.55], ['SS', 0.8]],
  please: [['PP', 1], ['DD', 0.45], ['E', 0.9], ['SS', 0.7]],
  thanks: [['TH', 0.85], ['aa', 0.7], ['nn', 0.5], ['kk', 0.6], ['SS', 0.75]],
  thank: [['TH', 0.85], ['aa', 0.7], ['nn', 0.5], ['kk', 0.7]],
  yes: [['ih', 0.55], ['E', 0.85], ['SS', 0.8]],
  no: [['nn', 0.7], ['oh', 1]],
  ok: [['oh', 0.9], ['kk', 0.7], ['E', 0.75]],
  okay: [['oh', 0.9], ['kk', 0.7], ['E', 0.85]],
};

type Token = { viseme: VisemeId; duration: number; weight: number };

export type MouthWord = {
  /** Inclusive start character index in the original spoken string. */
  start: number;
  /** Exclusive end character index. */
  end: number;
  cues: VisemeCue[];
  duration: number;
};

export function approximateMouthCues(text: string): VisemeCue[] {
  return flattenWords(buildMouthWords(text));
}

export function buildMouthWords(text: string): MouthWord[] {
  const words: MouthWord[] = [];
  const pattern = /[A-Za-z']+|[^.!?\s]+|[.!?]|\s+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;
    const end = start + raw.length;
    if (/^\s+$/.test(raw)) continue;
    if (/^[.!?]+$/.test(raw)) {
      words.push({
        start,
        end,
        cues: [{ time: 0, viseme: 'sil', weight: 1 }],
        duration: PAUSE_SEC,
      });
      continue;
    }
    if (/^[^A-Za-z']+$/.test(raw)) {
      words.push({
        start,
        end,
        cues: [{ time: 0, viseme: 'sil', weight: 1 }],
        duration: WORD_GAP_SEC,
      });
      continue;
    }
    const spoken = raw.toLowerCase().replace(/'/g, '');
    const tokens = WORDS[spoken] ? tokensFrom(WORDS[spoken]) : spellWord(spoken);
    const cues: VisemeCue[] = [];
    let time = 0;
    for (const token of tokens) {
      cues.push({ time, viseme: token.viseme, weight: token.weight });
      time += token.duration;
    }
    if (cues.length === 0) cues.push({ time: 0, viseme: 'sil', weight: 1 });
    words.push({ start, end, cues, duration: Math.max(time, HOLD_SEC) });
  }
  return words;
}

export function mouthWeightsAt(cues: VisemeCue[], elapsedSec: number): BlendshapeWeights {
  if (cues.length === 0 || elapsedSec < 0) return {};
  const last = cues[cues.length - 1];
  if (elapsedSec >= last.time) return scale(VISEME_BLENDSHAPES[last.viseme], last.weight);

  let index = 0;
  while (index < cues.length - 1 && cues[index + 1].time <= elapsedSec) index += 1;

  const current = cues[index];
  const next = cues[index + 1];
  const currentWeights = scale(VISEME_BLENDSHAPES[current.viseme], current.weight);
  if (!next) return currentWeights;

  const span = Math.max(0.001, next.time - current.time);
  const raw = Math.min(1, Math.max(0, (elapsedSec - current.time) / span));
  // Neighboring shapes overlap, the way the jaw carries one sound into the next.
  return mix(currentWeights, scale(VISEME_BLENDSHAPES[next.viseme], next.weight), smoothstep(raw));
}

/** Stretch a word's cues so they fill `durationSec`, then rest the mouth. */
export function scaledWordCues(word: MouthWord, durationSec: number): VisemeCue[] {
  const span = Math.max(0.16, durationSec);
  const speak = span * 0.9;
  const scaleBy = word.duration > 0.001 ? speak / word.duration : 1;
  const cues = word.cues.map((cue) => ({ ...cue, time: cue.time * scaleBy }));
  cues.push({ time: span, viseme: 'sil', weight: 0.7 });
  return cues;
}

function flattenWords(words: MouthWord[]): VisemeCue[] {
  const cues: VisemeCue[] = [];
  let time = 0;
  for (const word of words) {
    for (const cue of word.cues) {
      cues.push({ time: time + cue.time, viseme: cue.viseme, weight: cue.weight });
    }
    time += word.duration + WORD_GAP_SEC;
  }
  if (cues.length === 0) cues.push({ time: 0, viseme: 'sil', weight: 1 });
  return cues;
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
  if (pair === 'th') return { token: shape('TH', HOLD_SEC, 0.95), consumed: 2 };
  if (pair === 'sh' || pair === 'ch') return { token: shape('CH', HOLD_SEC, 1), consumed: 2 };
  if (pair === 'ph') return { token: shape('FF', HOLD_SEC, 0.95), consumed: 2 };
  if (pair === 'wh') return { token: shape('RR', HOLD_SEC, 0.8), consumed: 2 };
  if (pair === 'qu') return { token: shape('kk', CLOSURE_SEC, 0.9), consumed: 2 };
  if (pair === 'oo' || pair === 'ou' || pair === 'ew') return { token: vowel('ou'), consumed: 2 };
  if (pair === 'ee' || pair === 'ea' || pair === 'ie') return { token: vowel('E'), consumed: 2 };
  if (pair === 'ai' || pair === 'ay' || pair === 'ei') return { token: vowel('E'), consumed: 2 };
  if (pair === 'oa' || pair === 'ow') return { token: vowel('oh'), consumed: 2 };
  if (pair === 'oi' || pair === 'oy') return { token: vowel('oh'), consumed: 2 };
  if (pair === 'au' || pair === 'aw') return { token: vowel('oh'), consumed: 2 };
  if (char === next && !isVowel(char)) return { token: consonant(char), consumed: 2 };
  if (char === 'c' && next !== undefined && 'eiy'.includes(next)) {
    return { token: shape('SS', HOLD_SEC, 0.9), consumed: 1 };
  }
  if (char === 'c') return { token: shape('kk', CLOSURE_SEC, 0.85), consumed: 1 };
  return { token: isVowel(char) ? vowel(vowelFor(char)) : consonant(char), consumed: 1 };
}

function tokensFrom(parts: ReadonlyArray<readonly [VisemeId, number]>): Token[] {
  const open = new Set<VisemeId>(['aa', 'E', 'ih', 'oh', 'ou']);
  return parts.map(([viseme, weight]) => ({
    viseme,
    weight,
    duration: viseme === 'sil' ? 0.04 : open.has(viseme) ? VOWEL_SEC : CLOSURE_SEC,
  }));
}

function vowel(viseme: VisemeId): Token {
  return { viseme, duration: VOWEL_SEC, weight: 0.8 };
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
  if ('fv'.includes(char)) return shape('FF', HOLD_SEC, 0.95);
  if (char === 's' || char === 'z' || char === 'x') return shape('SS', HOLD_SEC, 0.9);
  if ('kgq'.includes(char)) return shape('kk', CLOSURE_SEC, 0.85);
  if (char === 'n') return shape('nn', HOLD_SEC, 0.8);
  if (char === 'r' || char === 'w' || char === 'y') return shape('RR', HOLD_SEC, 0.85);
  if (char === 'h') return shape('sil', 0.03, 1);
  if (char === 'l' || char === 't' || char === 'd') return shape('DD', CLOSURE_SEC, 0.9);
  return shape('DD', CLOSURE_SEC, 0.7);
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
