import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
self.onmessage = async (event: MessageEvent<{ pixels: ImageData; origin: string }>) => {
  try {
    prepareZXingModule({ overrides: { locateFile: (path: string) => `${event.data.origin}/engine/${path}` } });
    const codes = await readBarcodes(event.data.pixels, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 16 });
    self.postMessage({ codes: codes.filter(c => c.isValid).map(c => ({ text: c.text, points: Object.values(c.position) })) });
  } catch { self.postMessage({ error: true }); }
};
