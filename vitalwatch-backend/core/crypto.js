// ─────────────────────────────────────────────────────────────
//  AES-128-CBC for LoRa packets.
//  Packet = hex( IV[16 bytes] + ciphertext ), PKCS7 padding.
//  A fresh random IV per packet (the old fixed all-zero IV leaked
//  patterns: identical readings gave identical ciphertext).
// ─────────────────────────────────────────────────────────────
const crypto = require("crypto");
const { CONFIG } = require("../config/constants");

function key() {
  const k = Buffer.from(CONFIG.aesKey, "utf8");
  if (k.length !== 16) throw new Error("AES_KEY must be exactly 16 characters");
  return k;
}

function decryptHex(hex) {
  const buf = Buffer.from(hex.trim(), "hex");
  if (buf.length < 32 || buf.length % 16 !== 0) throw new Error("bad ciphertext length");
  const iv = buf.subarray(0, 16);
  const data = buf.subarray(16);
  const d = crypto.createDecipheriv("aes-128-cbc", key(), iv);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8").trim();
}

function encryptToHex(text) {
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv("aes-128-cbc", key(), iv);
  return Buffer.concat([iv, c.update(text, "utf8"), c.final()]).toString("hex");
}

module.exports = { decryptHex, encryptToHex };
