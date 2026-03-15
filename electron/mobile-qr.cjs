/**
 * QR Code generator for mobile inspection URLs.
 * Uses qrcode-generator (MIT, zero dependencies).
 */
const qrcode = require('qrcode-generator');

/**
 * Generate a QR code matrix from a text string.
 * @param {string} text - URL or text to encode
 * @returns {{ matrix: boolean[][], size: number, text: string }}
 */
function generateQR(text) {
  const qr = qrcode(0, 'M'); // type 0 = auto version, error correction M
  qr.addData(text);
  qr.make();

  const size = qr.getModuleCount();
  const matrix = [];
  for (let row = 0; row < size; row++) {
    const line = [];
    for (let col = 0; col < size; col++) {
      line.push(qr.isDark(row, col));
    }
    matrix.push(line);
  }

  return { matrix, size, text };
}

module.exports = { generateQR };
