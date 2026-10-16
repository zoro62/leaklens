import sharp from 'sharp';
import QRCode from 'qrcode';
import { mkdir } from 'node:fs/promises';
await mkdir('public/demos', { recursive: true });
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const text = (value, x, y, size = 26, color = '#202c2b', family = 'Arial') => `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" fill="${color}">${escape(value)}</text>`;
const line = (value, row, color = '#e2ede7') => text(value, 64, 158 + row * 48, 25, color, 'Consolas, monospace');
async function save(name, inner, width = 1200, height = 740, bg = '#f4f4ed') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${bg}"/>${inner}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`public/demos/${name}.png`);
}
await save('developer', `<rect width="1200" height="55" fill="#2c3438"/>${text('●   ●   ●       demo-service — terminal', 28, 35, 21, '#b8c6c9')}${text('SYNTHETIC DEMO · NONFUNCTIONAL VALUES', 64, 104, 22, '#a5d2bd')}${[
  '$ npm run connect',
  '[demo] Connecting to development service',
  'SERVICE_URL=https://api.example.test/v1',
  'API_KEY=DEMO_ONLY_NOT_A_REAL_KEY_7H2K9M',
  'Error: fictional request rejected (demo)',
  'Support: alex@example.com',
  'Private host: 10.12.0.8',
  'No live credentials. No external requests.',
].map((value, i) => line(value, i, i === 3 ? '#f2ce9e' : '#e0ebe7')).join('')}`, 1200, 620, '#172024');
const payload = 'SYNTHETIC DEMO\nBoarding pass\nPassenger: Avery Example\nPNR: DEMO7X\nFlight: LL123\nContact: avery@example.com';
const qr = await QRCode.toDataURL(payload, { width: 300, margin: 4, errorCorrectionLevel: 'M' });
await save('travel', `<rect x="35" y="35" width="1130" height="650" rx="18" fill="#fff" stroke="#a4b9ae" stroke-width="2"/><rect x="35" y="35" width="1130" height="95" rx="18" fill="#284e41"/>${text('EXAMPLE AIR / BOARDING PASS', 72, 92, 30, '#fff')}${text('SYNTHETIC DEMO · NOT VALID FOR TRAVEL', 72, 170, 23, '#566d60')}${text('Passenger:', 72, 230, 25)}<rect x="225" y="203" width="330" height="38" fill="#111"/>${text('Flight: LL123', 72, 290, 29)}${text('PNR: DEMO7X', 72, 345, 29)}${text('Departure: EXA to XYZ', 72, 400, 27)}${text('18 OCT 2026 / 09:40 / SEAT 12A', 72, 455, 25)}<image href="${qr}" x="755" y="220" width="300" height="300"/>${text('SCAN FOR TRAVEL DETAILS', 758, 543, 18)}${text('Name covered. Details still encoded in the QR.', 72, 620, 25, '#63766b')}`, 1200, 720);
await save('receipt', `<rect x="100" y="30" width="1000" height="760" rx="8" fill="#fff"/>${text('EXAMPLE SHOP', 160, 100, 36)}${text('SYNTHETIC DEMO · FICTIONAL RECEIPT', 160, 145, 23, '#69776e')}${text('Order reference: DEMO-ORD-48291', 160, 215, 28)}${text('Delivery address: 42 Example Lane, Demo City 000000', 160, 275, 27)}${text('Contact: +91 00000 00000', 160, 330, 28)}${text('Email: shopper@example.com', 160, 385, 28)}<path d="M160 420 H1040" stroke="#b8c2b9" stroke-width="2"/>${text('Notebook set                           240.00', 160, 485, 27)}${text('Desk organiser                         360.00', 160, 535, 27)}${text('TOTAL                                  600.00', 160, 610, 29)}${text('All names, numbers and addresses are fictional.', 160, 705, 23, '#68796c')}`, 1200, 820);
await save('control', `${text('SYNTHETIC DEMO · CONTROL IMAGE', 70, 95, 25, '#52695b')}${text('A small project update', 70, 180, 40)}${text('Build 20261016 completed in 1240 milliseconds.', 70, 260, 27)}${text('Processed 48291027 rows across 12 batches.', 70, 315, 27)}${text('Release notes: https://example.com/docs', 70, 370, 27)}${text('Version 2.4 / 36 items / total 600.00', 70, 425, 27)}${text('Public information, no contact or secret assignments.', 70, 510, 25)}`, 1200, 600);
await save('railway', `${text('SYNTHETIC DEMO - NOT A VALID TICKET', 60, 60, 24)}${text('Electronic Reservation Slip (ERS)', 60, 115, 30)}${text('IRCTC / Fictional railway fixture', 60, 165, 24)}${text('Booked from: EXAMPLE STATION', 60, 215, 24)}<rect x="60" y="250" width="100" height="28" fill="#000"/>${text('1234500000', 60, 330, 30)}${text('12345/EXAMPLE EXPRESS', 420, 330, 30)}${text('Passenger Details / Booking Status', 60, 400, 26)}${text('Transaction ID: 1234500000123', 60, 465, 24)}${text('A hidden label must not leave the reference uncovered.', 60, 540, 23)}`, 1200, 600);
await save('thorough', `${text('SYNTHETIC DEMO / THOROUGH SCAN', 60, 100, 32)}${text('alex@example.com', 1430, 420, 30)}${text('PNR: DEMO7X', 2700, 650, 30)}`, 3200, 900, '#fff');
console.log('Generated six synthetic PNG fixtures.');
