const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const dist = "dist";
const output = {};

for (const file of fs.readdirSync(dist)) {
  const filePath = path.join(dist, file);
  if (fs.statSync(filePath).isFile()) {
    const data = fs.readFileSync(filePath);
    const hash = crypto.createHash("sha384").update(data).digest("base64");
    output[file] = `sha384-${hash}`;
  }
}

fs.writeFileSync(
  path.join(dist, "integrity.json"),
  JSON.stringify(output, null, 2)
);
