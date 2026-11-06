const { handleMcpRequest, applyCorsHeaders } = require('../dist/server.js');

module.exports = async function handler(req, res) {
  if (applyCorsHeaders(req, res)) {
    return;
  }
  return handleMcpRequest(req, res);
};
