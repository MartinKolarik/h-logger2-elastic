import { Client } from '@elastic/elasticsearch';
import { Agent } from 'elastic-apm-node';
import BatchQueue = require('@martin-kolarik/batch-queue');
import { Logger, Writer } from 'h-logger2';
import type { LogLevelName, LogLevelValue } from 'h-logger2/src/types';

declare module 'h-logger2-elastic' {
	export interface ElasticWriterOptions {
		esClient: Client;
		apmClient?: Agent;
		index?: string;
		batchSize?: number;
		concurrency?: number;
		timeout?: number;
	}

	export interface ElasticErrorProperties {
		name?: string;
		message?: string;
		stack?: string;

		[key: string]: any;
	}

	export interface ApmCustomData {
		scope: string;
		message: string;
		attributes: Record<string, any>;
		context: Record<string, any>;
		tags: {
			level: LogLevelName;
		};

		[key: string]: any;
	}

	export class ElasticWriter extends Writer {
		client: Client;
		options: ElasticWriterOptions;
		queue: BatchQueue<any>;
		seqDate: SeqDate;

		static ApmSerializers: {
			ctx (): undefined;
			req (): undefined;
			res (): undefined;
		};

		constructor (level: LogLevelValue, options: ElasticWriterOptions);

		static getErrorProperties (error: any): ElasticErrorProperties;

		sendToElastic (records: any[]): Promise<void>;

		write (logger: Logger, level: LogLevelValue, message: string, error?: Error, context?: any): void;
	}

	export class SeqDate {
		date?: number;
		seq?: number;

		now (): number;
	}

	export = ElasticWriter;
}
