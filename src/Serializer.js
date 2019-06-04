const { Serializer } = require('@elastic/elasticsearch');
const stringify = require('safe-json-stringify');

module.exports = class extends Serializer {
	serialize (object) {
		return stringify(object, (name, value) => {
			if (typeof value === 'string' && value.length > 4096) {
				return value.slice(0, 2048) + `\n... truncated ${value.length - 4096} bytes ...\n` + value.slice(-2048);
			}

			return value;
		});
	}
};
