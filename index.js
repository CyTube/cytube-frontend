var cluster = require('cluster');
var redisAdapter = require('socket.io-redis');
var IOConfiguration = require('./lib/configuration/ioconfig')['default'];
var WebConfiguration = require('./lib/configuration/webconfig')['default'];
var RedisClientProvider = require('./lib/redis/redisclientprovider')['default'];

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
    var redisConfig = {
        host: 'localhost',
        port: 6379,
        retry_max_delay: 2000
    };
    var redisClientProvider = new RedisClientProvider(redisConfig);
    var ioConfig = new IOConfiguration(JSON.parse(process.env.IO_CONFIG));
    var webConfig = new WebConfiguration(JSON.parse(process.env.WEB_CONFIG));
    var adapter = redisAdapter({
        pubClient: redisClientProvider.get(true),
        subClient: redisClientProvider.get(true)
    });
    var Worker = require(process.env.WORKER_MODULE)['default'];
    new Worker(redisClientProvider, adapter, ioConfig, webConfig).initialize();
}
