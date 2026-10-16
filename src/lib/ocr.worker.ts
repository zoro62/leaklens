import { createWorker } from 'tesseract.js';
import type { Word } from './model';
self.onmessage = async (event: MessageEvent<{ blob: Blob; origin: string }>) => {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    const base = `${event.data.origin}/engine`;
    worker = await createWorker('eng', 1, { workerPath: `${base}/worker.min.js`, corePath: base, langPath: base, cacheMethod: 'none', workerBlobURL: false,
      errorHandler: () => self.postMessage({ error: true }),
      logger: message => { if (message.status === 'recognizing text') self.postMessage({ progress: Math.round(message.progress * 100) }); },
    });
    const { data } = await worker.recognize(event.data.blob, {}, { blocks: true, text: true });
    const words: Word[] = []; let text = '';
    for (const [blockIndex, block] of (data.blocks || []).entries()) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) {
      for (const word of line.words) {
        const start = text.length; text += word.text + ' ';
        words.push({ text: word.text, start, end: start + word.text.length, block: blockIndex, box: { x: word.bbox.x0, y: word.bbox.y0, width: word.bbox.x1 - word.bbox.x0, height: word.bbox.y1 - word.bbox.y0 } });
      }
      text = text.trimEnd() + '\n';
    }
    self.postMessage({ text, words });
  } catch { self.postMessage({ error: true }); }
  finally { await worker?.terminate(); }
};
