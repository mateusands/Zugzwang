/**
 * Sons do jogo, sintetizados via Web Audio (sem arquivos de áudio). A escolha
 * de qual som tocar (`pickSound`) é pura e testável; a síntese é I/O e só roda
 * no navegador.
 */

export type SoundKind = 'move' | 'capture' | 'check' | 'checkmate';

/** Escolhe o som de um lance, por prioridade: mate > xeque > captura > lance. */
export function pickSound(status: string, isCapture: boolean): SoundKind {
  if (status === 'checkmate') return 'checkmate';
  if (status === 'check') return 'check';
  if (isCapture) return 'capture';
  return 'move';
}

let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  audioContext ??= new AudioContext();
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

function blip(
  ac: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
  gain: number,
): void {
  const oscillator = ac.createOscillator();
  const envelope = ac.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(ac.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

/** Play a synthesized sound for the given event. No-op outside the browser. */
export function playSound(kind: SoundKind): void {
  const ac = context();
  if (!ac) return;
  const t = ac.currentTime;
  switch (kind) {
    case 'move':
      blip(ac, 220, t, 0.08, 'sine', 0.34);
      break;
    case 'capture':
      blip(ac, 150, t, 0.12, 'triangle', 0.3);
      blip(ac, 90, t + 0.02, 0.12, 'sawtooth', 0.2);
      break;
    case 'check':
      blip(ac, 660, t, 0.09, 'square', 0.26);
      blip(ac, 880, t + 0.11, 0.09, 'square', 0.26);
      break;
    case 'checkmate':
      blip(ac, 523, t, 0.16, 'sine', 0.34);
      blip(ac, 392, t + 0.16, 0.18, 'sine', 0.34);
      blip(ac, 262, t + 0.34, 0.28, 'sine', 0.36);
      break;
  }
}
