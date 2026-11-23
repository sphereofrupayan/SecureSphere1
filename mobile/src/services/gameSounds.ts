import { Platform } from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

export type GameSoundEffect = "ludoRoll" | "ludoStep" | "ludoCapture" | "ludoWin";

const SOUND_ASSETS: Record<GameSoundEffect, number> = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ludoRoll: require("../../assets/sounds/ludo-roll.wav"),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ludoStep: require("../../assets/sounds/ludo-step.wav"),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ludoCapture: require("../../assets/sounds/ludo-capture.wav"),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ludoWin: require("../../assets/sounds/ludo-win.wav"),
};

class GameSoundEngine {
  private players: Partial<Record<GameSoundEffect, AudioPlayer>> = {};
  private muted = false;
  private audioModeReady = false;
  private lastPlayedAt: Partial<Record<GameSoundEffect, number>> = {};

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(nextMuted: boolean): void {
    this.muted = Boolean(nextMuted);
  }

  private async ensureAudioMode(): Promise<void> {
    if (this.audioModeReady || Platform.OS === "web") return;
    this.audioModeReady = true;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: "mixWithOthers",
        shouldRouteThroughEarpiece: false,
      });
    } catch {
      this.audioModeReady = false;
    }
  }

  private getOrCreatePlayer(effect: GameSoundEffect): AudioPlayer | null {
    const existing = this.players[effect];
    if (existing) return existing;
    try {
      const player = createAudioPlayer(SOUND_ASSETS[effect]);
      player.volume = 1.0;
      this.players[effect] = player;
      return player;
    } catch {
      return null;
    }
  }

  public preloadAll(): void {
    void this.ensureAudioMode();
    (["ludoRoll", "ludoStep", "ludoCapture", "ludoWin"] as GameSoundEffect[]).forEach(effect => {
      this.getOrCreatePlayer(effect);
    });
  }

  public async play(effect: GameSoundEffect, minGapMs = 120): Promise<void> {
    if (this.muted) return;

    const now = Date.now();
    const prev = this.lastPlayedAt[effect] ?? 0;
    if (now - prev < minGapMs) return;
    this.lastPlayedAt[effect] = now;

    await this.ensureAudioMode();

    const player = this.getOrCreatePlayer(effect);
    if (player) {
      try {
        player.volume = 1.0;
        await player.seekTo(0);
        player.play();
        return;
      } catch {
        // fallback below if player state needs recreation
      }
    }

    // Fallback Web Audio synth on web if HTMLAudio autoplay/codec failed
    if (Platform.OS === "web") {
      this.playWebSynthFallback(effect);
    }
  }

  private playWebSynthFallback(effect: GameSoundEffect): void {
    try {
      const Ctx = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }
      const beep = (freq: number, endFreq: number, delay: number, dur: number, vol = 0.16) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t0 = ctx.currentTime + delay;
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, t0);
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t0 + dur);
        gain.gain.setValueAtTime(0.001, t0);
        gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      };

      if (effect === "ludoRoll") {
        [300, 420, 340, 460, 380].forEach((f, idx) => beep(f, f * 0.7, idx * 0.068, 0.045, 0.16));
        beep(240, 120, 0.36, 0.09, 0.2);
      } else if (effect === "ludoStep") {
        beep(420, 620, 0, 0.07, 0.14);
      } else if (effect === "ludoCapture") {
        beep(640, 180, 0, 0.22, 0.18);
      } else if (effect === "ludoWin") {
        [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => beep(n, n, i * 0.085, 0.16, 0.16));
      }
    } catch {
      // ignore
    }
  }
}

export const gameSounds = new GameSoundEngine();
