const ElasticWriter = require('./ElasticWriter');
const libs = require('./libs');

module.exports = ElasticWriter;
module.exports.express = libs.express;
module.exports.koa = libs.koa;
