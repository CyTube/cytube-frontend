const cluster = require('cluster');
const ConfigLoader = require('cytube-common/lib/configuration/configloader');
const FrontendConfiguration = require('./lib/configuration/frontendconfig')['default'];
const logger = require('cytube-common/lib/logger')['default'];
const path = require('path');
require('source-map-support').install();
const profiler = require('v8-profiler');
const fs = require('fs');

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
    var profilerOutput = null;
    logger.info('worker-' + cluster.worker.id + ' has PID ' + process.pid);
    process.on('SIGUSR2', function onSIGUSR2() {
        if (!profilerOutput) {
            profilerOutput = Math.random().toString(36).substring(2) + '.cpuprofile';
            profiler.startProfiling(profilerOutput);
            logger.info('Starting profile ' + profilerOutput);
        } else {
            const profile = profiler.stopProfiling();
            profile.export(function onExported(error, result) {
                if (error) {
                    logger.error('Error exporting CPU profile: ' + error);
                } else {
                    fs.writeFileSync(profilerOutput, result);
                    logger.info('Saved profile ' + profilerOutput);
                    profile.delete();
                    profilerOutput = null;
                }
            });
        }
    });
}
