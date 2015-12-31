const cluster = require('cluster');
const ConfigLoader = require('cytube-common/lib/configuration/configloader');
const FrontendConfiguration = require('./lib/configuration/frontendconfig')['default'];
const logger = require('cytube-common/lib/logger')['default'];
const path = require('path');

var frontendConfig;
try {
    frontendConfig = ConfigLoader.loadFromToml(FrontendConfiguration,
            path.resolve(__dirname, 'frontend.toml'));
} catch (error) {
    if (typeof error.line !== undefined) {
        logger.error(`Error in configuration file: ${error} (line ${error.line})`);
    } else {
        logger.error('Error loading configuration: ' + error);
    }
    process.exit(1);
}

if (cluster.isMaster) {
    const Master = require('./lib/cluster/master')['default'];
    new Master(frontendConfig).initialize();
} else {
    const Worker = require('./lib/cluster/worker')['default'];
    new Worker(frontendConfig).initialize();
}
