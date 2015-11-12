var cluster = require('cluster');

if (cluster.isMaster) {
    var IOConfiguration = require('./lib/configuration/ioconfig')['default'];

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

}
