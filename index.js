var cluster = require('cluster');
var IOConfiguration = require('./lib/configuration/ioconfig')['default'];
var WebConfiguration = require('./lib/configuration/webconfig')['default'];
var RedisConfiguration = require('./lib/configuration/redisconfig')['default'];
var RedisClientFactory = require('./lib/redis/redisclient-factory')['default'];

if (cluster.isMaster) {
    var ioConfig = new IOConfiguration({
        listeners: [
            {
                host: '0.0.0.0',
                port: 3005
            }
        ],
        processCount: 4
    });

    var webConfig = new WebConfiguration({
        trustProxy: [
            '127.0.0.1',
            '::1'
        ]
    });

    const Master = require('./lib/socket/master')['default'];
    new Master(ioConfig, webConfig).initialize();
} else {
    var redisConfig = new RedisConfiguration({
        host: 'localhost',
        port: 6379,
        maxReconnectDelay: 2000
    });
    var redisClientFactory = new RedisClientFactory(redisConfig);
    var workerModule = require(process.env.WORKER_MODULE);
    workerModule['default'](
            new IOConfiguration(
                    JSON.parse(process.env.IO_CONFIG)),
            redisClientFactory);
}
