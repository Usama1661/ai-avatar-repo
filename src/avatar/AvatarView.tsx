import { AIAvatar } from './AIAvatar';
import type { AvatarViewProps } from './types';

/** Older surface. Prefer `AIAvatar` when you need speech or animation switches. */
export function AvatarView({
  model,
  sex = 'male',
  expression = 'neutral',
}: AvatarViewProps) {
  return <AIAvatar model={model?.sex ?? sex} expression={expression} />;
}
