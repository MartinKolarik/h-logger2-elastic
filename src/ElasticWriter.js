const _ = require('lodash');
const Serializer = require('./Serializer');
const Writer = require('h-logger2').Writer;
const BatchQ = require('@martin-kolarik/batch-queue');

const hostname = require('os').hostname();
const defaults = { index: `logger-v5`, batchSize: 100, concurrency: 2, timeout: 4000 };

class ElasticWriter extends Writer {
	/**
	 * @param {number} level
	 * @param {{ esClient: Client, apmClient?: Agent }} options
	 */
	constructor (level, options) {
		super(level, options);

		if (!options.esClient) {
			throw new Error(`options.esClient is required`);
		}

		this.client = options.esClient.child({ Serializer });
		this.options = Object.assign({}, defaults, this.options);
		this.queue = new BatchQ(items => this.sendToElastic(items), this.options);
		this.seqDate = new SeqDate();
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
		let { apmClient } = this.options;
		let levelAsString = logger.constructor.levelsByValue[level];

		if (apmClient && level >= logger.constructor.levels.error) {
			apmClient.captureError(error || new Error(message), {
				custom: {
					scope,
					message,
					attributes: ElasticWriter.getErrorProperties(logger.serialize(error)),
					context: logger.serialize(context, ElasticWriter.ApmSerializers),
					tags: { level: levelAsString },
				},
				handled: !context || context.handled === undefined || context.handled,
			});
		} else {
			let record = { scope, log: { level: levelAsString }, message };

			if (error) {
				record.error = Object.assign({
					message: error.message,
					stack: error.stack,
				}, error);
			}

			if (context) {
				record.context = logger.serialize(context);
			}

			record.host = { hostname, name: hostname };
			record.service = { name: apmClient?.getServiceName() || scope.split(':')[0], environment: process.env.NODE_ENV };
			record.process = { pid: process.pid };
			record['@timestamp'] = new Date(this.seqDate.now()).toISOString();

			// Transaction integration based on https://github.com/elastic/ecs-logging-nodejs/blob/main/loggers/pino/index.js
			let transaction = apmClient?.currentTransaction;

			if (transaction) {
				record.trace = { id: transaction.traceId };
				record.transaction = { id: transaction.id };

				let span = apmClient.currentSpan;

				if (span) {
					record.span = { id: span.id };
				}
			}

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

class SeqDate {
	now () {
		let now = Math.floor(Date.now() / 1000) * 1000;

		if (now !== this.date) {
			this.date = now;
			this.seq = 0;
		}

		return now + Math.min(this.seq++, 999);
	}
}

module.exports = ElasticWriter;
