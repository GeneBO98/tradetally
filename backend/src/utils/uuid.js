const { randomUUID } = require('crypto');

function uuidv4() {
  return randomUUID();
}

module.exports = { uuidv4 };
