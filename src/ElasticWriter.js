const stringify = require('safe-json-stringify');
const Writer = require('h-logger2').Writer;

const hostname = require('os').hostname();
const version = require('../package.json').version;

class ElasticWriter extends Writer {
	constructor (level, options) {
		super(level, options);

		if (!options.esClient) {
			throw new Error(`options.esClient is required`);
		}
	}

	write (logger, level, message, error, context) {
		let scope = logger.name;

		if (this.options.apmClient && level >= logger.constructor.levels.error) {
			this.options.apmClient.captureError(error, {
				custom: {
					scope,
					message,
					context: logger.serialize(context, ElasticWriter.ApmSerializers),
				},
			});
		} else {
			let body = { scope, level, message };

			if (error) {
				body.error = Object.assign({
					message: error.message,
					stack: error.stack,
				}, error);
			}

			if (context) {
				body.context = logger.serialize(context);
			}

			body.hostname = hostname;
			body.pid = process.pid;
			body['@timestamp'] = new Date().toISOString();

			this.options.esClient.index({
				index: `logger-v${version}-${body['@timestamp'].substr(0, 10)}`,
				type: `logger-v${version}`,
				body: stringify(body),
			}).catch(e => console.error('ElasticWriter error:', e));
		}
	}
}

ElasticWriter.ApmSerializers = {
	ctx () {
		return undefined;
	},
	req () {
		return undefined;
	},
	res () {
		return undefined;
	},
};

module.exports = ElasticWriter;
