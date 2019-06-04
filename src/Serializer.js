const { Serializer } = require('@elastic/elasticsearch');
const stringify = require('safe-json-stringify');

module.exports = class extends Serializer {
	serialize (object) {
		return stringify(object);
	}
};
