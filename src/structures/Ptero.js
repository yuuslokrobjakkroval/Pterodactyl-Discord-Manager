const axios = require("axios");
const { ptero } = require("../../settings");

const api = axios.create({
  baseURL: `${ptero.url}/api/application`,
  timeout: 15000,
  headers: {
    Authorization: `Bearer ${ptero.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

module.exports = api;
