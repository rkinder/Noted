const crypto = require('crypto');
const config = require('../config');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getDerivedKey() {
  // scrypt to stretch/normalize any key length to 32 bytes
  return crypto.scryptSync(config.encryptionKey, 'noted-salt-v1', 32);
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getDerivedKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Layout: [IV (16)] [AuthTag (16)] [Ciphertext]
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(base64Data) {
  const data = Buffer.from(base64Data, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const key = getDerivedKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
