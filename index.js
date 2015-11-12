var cluster = require('cluster');
var IOConfiguration = require('./lib/configuration/ioconfig')['default'];

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

    require('./lib/socket/master')['default'](ioConfig);
} else {
    var workerModule = require(process.env.WORKER_MODULE);
    workerModule['default'](
            new IOConfiguration(
                    JSON.parse(process.env.IO_CONFIG)));
}
