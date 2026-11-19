// npm run test:crypto -> encrypts a sample band payload and decodes it back
require("dotenv").config();
const { encryptToHex } = require("../core/crypto");
const { parseLine } = require("../core/packetParser");

const payload = "S001,42,84,96,36.7,18.4,654.2,1,0,34.152600,77.577100,8,81,31";
const hex = encryptToHex(payload);
const line = `$VWE,${hex},-94,7.5`;
const out = parseLine(line);

console.log("Payload :", payload);
console.log("Line    :", line);
console.log("Parsed  :", out.payload);
console.log(out.kind === "band" && out.payloadText === payload ? "\nCRYPTO TEST PASSED" : "\nCRYPTO TEST FAILED");
