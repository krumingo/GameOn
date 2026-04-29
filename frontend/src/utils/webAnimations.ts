/**
 * Inject CSS keyframe animations for web fallback.
 * Reanimated does not always work in expo web; these CSS animations
 * provide a guaranteed-visible animation layer for web users.
 */
import { Platform } from 'react-native';

const CSS = `
@keyframes goFadeInUp {
  from { opacity: 0; transform: translate3d(0, 16px, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes goPulse {
  0%, 100% { opacity: 0.35; }
  50%      { opacity: 0.75; }
}
@keyframes goBounce {
  0%   { transform: scale(1); }
  35%  { transform: scale(0.94); }
  70%  { transform: scale(1.06); }
  100% { transform: scale(1); }
}
@keyframes goSlideRight {
  from { opacity: 0; transform: translate3d(-12px, 0, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes goShimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.go-fade-in-up { animation: goFadeInUp 320ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.go-pulse      { animation: goPulse 1.5s ease-in-out infinite; }
.go-bounce     { animation: goBounce 360ms ease-out; }
.go-slide-r    { animation: goSlideRight 280ms ease-out both; }
.go-shimmer    {
  background: linear-gradient(90deg,
    rgba(255,255,255,0.04) 0%,
    rgba(255,255,255,0.12) 50%,
    rgba(255,255,255,0.04) 100%);
  background-size: 200% 100%;
  animation: goShimmer 1.6s linear infinite;
}
.go-press      { transition: transform 0.18s ease, box-shadow 0.18s ease; }
.go-press:active { transform: scale(0.97); }
`;

let injected = false;
export function injectWebAnimations() {
  if (Platform.OS !== 'web' || injected) return;
  if (typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.id = 'go-web-animations';
  style.textContent = CSS;
  document.head.appendChild(style);
  injected = true;
}

/**
 * Returns a web-only `style` prop carrying CSS animation properties.
 * On native, returns an empty object so RN ignores it.
 */
export function webAnim(
  className: 'fade-in-up' | 'pulse' | 'bounce' | 'slide-r' | 'shimmer' | 'press',
  opts: { delay?: number } = {},
): any {
  if (Platform.OS !== 'web') return {};
  const map: Record<string, string> = {
    'fade-in-up': 'go-fade-in-up',
    pulse: 'go-pulse',
    bounce: 'go-bounce',
    'slide-r': 'go-slide-r',
    shimmer: 'go-shimmer',
    press: 'go-press',
  };
  return {
    // @ts-ignore — pass className through to react-native-web
    className: map[className],
    style: opts.delay
      ? ({ animationDelay: `${opts.delay}ms` } as any)
      : undefined,
  };
}
