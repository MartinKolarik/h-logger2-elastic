import os from 'node:os';
import _ from 'lodash';
import { Agent } from 'elastic-apm-node';
import Logger, { LogLevelValue, Writer } from 'h-logger2';
import BatchQ from '@martin-kolarik/batch-queue';
import { Client } from '@elastic/elasticsearch';
import Serializer from './Serializer.js';

const hostname = os.hostname();
const defaults = { index: `logs-logger-default`, batchSize: 100, concurrency: 2, timeout: 4000 };

interface ElasticWriterOptions {
	esClient: Client;
	apmClient?: Agent;
	index?: string;
	batchSize?: number;
	concurrency?: number;
	timeout?: number;
}

interface Record {
	scope: string;
	log: { level: string };
	message: string;
	error?: any;
	context?: any;
	host?: { hostname: string; name: string };
	service?: { name: string; environment?: string };
	process?: { pid: number };
	'@timestamp'?: string;
	trace?: { id: string };
	transaction?: { id: string };
	span?: { id: string };
}

class ElasticWriter extends Writer {
	client: Client;
	options: ElasticWriterOptions;
	queue: BatchQ<Record>;
	seqDate: SeqDate;

	static ApmSerializers = {
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

	constructor (level: LogLevelValue, options: ElasticWriterOptions) {
		super(level, options);

		if (!options.esClient) {
			throw new Error('options.esClient is required');
		}

		this.client = options.esClient.child({ Serializer });
		this.options = { ...defaults, ...options };
		this.queue = new BatchQ((items: Record[]) => this.sendToElastic(items), this.options);
		this.seqDate = new SeqDate();
	}

	static getErrorProperties (error: any): any {
		if (!error || typeof error !== 'object') {
			return {};
		}

		return _.assign(
			// Support errors that have other errors as properties:
			// http://bluebirdjs.com/docs/api/aggregateerror.html
			_.mapValues(error, (value: any) => {
				if (value instanceof Error) {
					return _.assign(
						{
							name: value.name,
							message: value.message,
							stack: value.stack,
						},
						value,
					);
				}

				return value;
			}),
			{ message: error.message },
		);
	}

	private sendToElastic (records: Record[]): Promise<void> {
		const body: any[] = [];

		records.forEach((record) => {
			body.push({ create: {} });
			body.push(record);
		});

		// The client performs 3 retries by default.
		return this.client.bulk({ index: this.options.index, body }).catch((error) => {
			console.error('ElasticWriter error (failed to store logs in elastic):', error, body);

			if (this.options.apmClient) {
				this.options.apmClient.captureError(error);
			}
		}) as Promise<void>;
	}

	write (logger: Logger, level: LogLevelValue, message: string, error: Error | null, context: any): void {
		const scope = logger.name;
		const { apmClient } = this.options;
		const cons = logger.constructor as unknown as typeof Logger;
		const levelAsString = cons.levelsByValue[level].toLowerCase();

		if (apmClient && level >= cons.levels.error) {
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
			const record: Record = { scope, log: { level: levelAsString }, message };

			if (error) {
				record.error = Object.assign({ message: error.message, stack: error.stack }, error);
			}

			if (context) {
				record.context = logger.serialize(context);
			}

			record.host = { hostname, name: hostname };
			record.service = { name: apmClient?.getServiceName() || scope.split(':')[0], environment: process.env.NODE_ENV };
			record.process = { pid: process.pid };
			record['@timestamp'] = new Date(this.seqDate.now()).toISOString();

			const ids = apmClient?.currentTraceIds;

			if (ids?.['trace.id']) {
				record.trace = { id: ids['trace.id'] };
			}

			if (ids?.['transaction.id']) {
				record.transaction = { id: ids['transaction.id'] };
			}

			if (ids?.['span.id']) {
				record.span = { id: ids['span.id'] };
			}

			this.queue.push(record);
		}
	}
}

class SeqDate {
	private date?: number;
	private seq: number = 0;

	now (): number {
		const now = Math.floor(Date.now() / 1000) * 1000;

		if (now !== this.date) {
			this.date = now;
			this.seq = 0;
		}

		return now + Math.min(this.seq++, 999);
	}
}

export default ElasticWriter;
