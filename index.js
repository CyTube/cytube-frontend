var cluster = require('cluster');
var ClusterConfiguration = require('./lib/configuration/clusterconfig')['default'];
var WebConfiguration = require('./lib/configuration/webconfig')['default'];
var RedisClientProvider = require('cytube-common/lib/redis/redisclientprovider')['default'];

if (cluster.isMaster) {
    var clusterConfig = new ClusterConfiguration({
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

    const Master = require('./lib/cluster/master')['default'];
    new Master(clusterConfig, webConfig).initialize();
} else {
    var redisConfig = {
        host: 'localhost',
        port: 6379,
        retry_max_delay: 2000
    };
    var redisClientProvider = new RedisClientProvider(redisConfig);
    var Worker = require('./lib/cluster/worker')['default'];
    new Worker(redisClientProvider).initialize();
}
