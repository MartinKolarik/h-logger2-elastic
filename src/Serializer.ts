import { Serializer } from '@elastic/elasticsearch';
import stringify from 'safe-json-stringify';

export default class CustomSerializer extends Serializer {
	serialize (object: any): string {
		return stringify(object, (name: string, value: any): any => {
			if (typeof value === 'string' && value.length > 4096) {
				return value.slice(0, 2048) + `\n... truncated ${value.length - 4096} bytes ...\n` + value.slice(-2048);
			}

			return value;
		});
	}
}
