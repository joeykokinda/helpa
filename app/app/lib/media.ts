const transcribeSampleRate = 16000;

/** Muse Voice Transcribe only takes 16 kHz mono 16-bit WAV, so resample the recording in the browser. */
export async function toWav(recording: Blob): Promise<Blob> {
  const decoded = await new AudioContext().decodeAudioData(await recording.arrayBuffer());
  const frameCount = Math.ceil(decoded.duration * transcribeSampleRate);
  const offline = new OfflineAudioContext(1, frameCount, transcribeSampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);

  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const writeText = (offset: number, text: string) =>
    [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, transcribeSampleRate, true);
  view.setUint32(28, transcribeSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return new Blob([view], { type: "audio/wav" });
}

/** Grabs the current video frame as a JPEG, scaled so the long side is at most maxSide. */
export function captureFrame(video: HTMLVideoElement, maxSide = 1280): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("capture failed"))), "image/jpeg", 0.85),
  );
}

/** Shrinks an uploaded photo the same way, so phone photos don't blow the upload limit. */
export async function shrinkPhoto(file: Blob, maxSide = 1280): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("resize failed"))), "image/jpeg", 0.85),
  );
}

let speechQueue: Promise<void> = Promise.resolve();

/** Speaks text aloud, one line at a time, reporting when Helpa's mouth should move. */
export function speak(text: string, onSpeaking: (speaking: boolean) => void): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve();
  speechQueue = speechQueue.then(
    () =>
      new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.02;
        utterance.pitch = 1.1;
        utterance.onstart = () => onSpeaking(true);
        utterance.onend = utterance.onerror = () => {
          onSpeaking(false);
          resolve();
        };
        window.speechSynthesis.speak(utterance);
      }),
  );
  return speechQueue;
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  speechQueue = Promise.resolve();
}
