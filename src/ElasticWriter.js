const _ = require('lodash');
const Serializer = require('./Serializer');
const Writer = require('h-logger2').Writer;
const BatchQ = require('@martin-kolarik/batch-queue');

const hostname = require('os').hostname();
const defaults = { index: `logger-v3`, batchSize: 100, concurrency: 2, timeout: 4000 };

class ElasticWriter extends Writer {
	constructor (level, options) {
		super(level, options);

		if (!options.esClient) {
			throw new Error(`options.esClient is required`);
		}

		this.client = options.esClient.child({ Serializer });
		this.options = Object.assign({}, defaults, this.options);
		this.queue = new BatchQ(items => this.sendToElastic(items), this.options);
	}

	static getErrorProperties (error) {
		if (!error || typeof error !== 'object') {
			return {};
		}

		return _.assign(_.mapValues(error, (value) => {
			// Support errors that have other errors as properties:
			// http://bluebirdjs.com/docs/api/aggregateerror.html
			if (value instanceof Error) {
				return _.assign({
					name: value.name,
					message: value.message,
					stack: value.stack,
				}, value);
			}

			return value;
		}), { message: error.message });
	}

	sendToElastic (records) {
		let body = [];

		records.forEach((record) => {
			body.push({ index: {} });
			body.push(record);
		});

		// The client performs 3 retries by default.
		return this.client.bulk({ index: this.options.index, body }).catch((error) => {
			console.error('ElasticWriter error (failed to store logs in elastic):', error, body);

			if (this.options.apmClient) {
				this.options.apmClient.captureError(error);
			}
		});
	}

	write (logger, level, message, error, context) {
		let scope = logger.name;

		if (this.options.apmClient && level >= logger.constructor.levels.error) {
			this.options.apmClient.captureError(error || new Error(message), {
				custom: {
					scope,
					message,
					attributes: ElasticWriter.getErrorProperties(error),
					context: logger.serialize(context, ElasticWriter.ApmSerializers),
					tags: { level },
				},
				handled: !context || context.handled === undefined || context.handled,
			});
		} else {
			let record = { scope, level, message };

			if (error) {
				record.error = Object.assign({
					message: error.message,
					stack: error.stack,
				}, error);
			}

			if (context) {
				record.context = logger.serialize(context);
			}

			record.service = scope.split(':')[0];
			record.hostname = hostname;
			record.pid = process.pid;
			record['@timestamp'] = new Date().toISOString();

			this.queue.push(record);
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
