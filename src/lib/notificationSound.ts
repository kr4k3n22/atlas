/**
 * Plays a short audio chime using the Web Audio API (no external files needed).
 *
 * @param urgent - When true, plays an urgent double-beep (for BLOCK-level cases).
 *                 When false, plays a single beep (for ESCALATE-level cases).
 */
export function playNotificationChime(urgent: boolean = false) {
  try {
    const ctx = new (window.AudioContext ||
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)();

    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    playTone(880, ctx.currentTime, 0.15);
    if (urgent) {
      playTone(988, ctx.currentTime + 0.2, 0.15);
    }
  } catch {
    // Audio not available – silently ignore
  }
}
