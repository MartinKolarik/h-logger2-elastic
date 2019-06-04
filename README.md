# h-logger2-elastic

Elasticsearch and APM integration for [h-logger2](https://github.com/MartinKolarik/h-logger2).

## Installation

```
$ npm install h-logger2-elastic
```

Creating Elasticsearch template (use `src/template.json`):

```
PUT /_template/logger-v3
<template>
```

Creating lifecycle policy (use `src/policy.json`):

```
PUT /_ilm/policy/logger-v3
<policy>
```

Creating the index:

```
PUT /logger-v3-000001 
{
    "aliases": {
        "logger-v3": {}
    }
}
```

## Usage

```js
const Logger = require('h-logger2');
const ElasticWriter = require('h-logger2-elastic');

const logger = new Logger('my-app-name', [ new Logger.ElasticWriter(Logger.TRACE, {
    esClient, // instance of elasticsearch client (https://github.com/elastic/elasticsearch-js)
    apmClient, // optional, instance of APM client (https://github.com/elastic/apm-agent-nodejs)
}) ]);
```

When `apmClient` is gived, messages with levels `error` and `fatal` are captured as APM errors instead of being sent to the regular elasticsearch index.

## License
Copyright (c) 2018 - 2019 Martin Kolárik. Released under the MIT license.
