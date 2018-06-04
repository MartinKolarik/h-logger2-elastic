const stringify = require('safe-json-stringify');
const promiseRetry = require('promise-retry');
const Writer = require('h-logger2').Writer;

const hostname = require('os').hostname();
const version = require('../package.json').version;
const defaults = { indexPrefix: 'logger', docType: 'log-entry' };

class ElasticWriter extends Writer {
	constructor (level, options) {
		super(level, options);

		if (!options.esClient) {
			throw new Error(`options.esClient is required`);
		}

		this.options = Object.assign({}, defaults, this.options);
	}

	write (logger, level, message, error, context) {
		let scope = logger.name;

		if (this.options.apmClient && level >= logger.constructor.levels.error && error) {
			this.options.apmClient.setTag('level', level);
			this.options.apmClient.captureError(error, {
				custom: {
					scope,
					message,
					context: logger.serialize(context, ElasticWriter.ApmSerializers),
					error: Object.assign({}, error),
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

			body.service = scope.split(':')[0];
			body.hostname = hostname;
			body.pid = process.pid;
			body['@timestamp'] = new Date().toISOString();

			promiseRetry((retry) => {
				return this.options.esClient.index({
					index: `${this.options.indexPrefix}-v${version}-${body['@timestamp'].substr(0, 10)}`,
					type: this.options.docType,
					body: stringify(body),
				}).catch(retry);
			}, { retries: 2 }).catch((error) => {
				console.error('ElasticWriter error:', error, body);

				if (this.options.apmClient) {
					this.options.apmClient.captureError(error);
				}
			});
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
