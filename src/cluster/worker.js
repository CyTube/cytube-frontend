import cluster from 'cluster';
import fs from 'fs';
import http from 'http';
import https from 'https';
import logger from 'cytube-common/lib/logger';
import RedisClientProvider from 'cytube-common/lib/redis/redisclientprovider';
import IOFrontendNode from '../socketio/iofrontend';
import Database from 'cytube-common/lib/database/database';
import * as Metrics from 'cytube-common/lib/metrics/metrics';
import { JSONFileMetricsReporter } from 'cytube-common/lib/metrics/jsonfilemetricsreporter';
import path from 'path';

// Arbitrarily chosen exit code not already used by node.js.
// Returned when a fatal error occurs that should terminate
// the entire process and not just respawn the worker.
const WORKER_FATAL = 55;
const METRICS_FILENAME = path.join(__dirname, '..', '..', 'metrics.log');
const COUNTER_RECEIVE_SOCKET = 'cytube-frontend:worker:receiveSocket';
const COUNTER_RECEIVE_NULL_SOCKET = 'cytube-frontend:worker:receiveSocket:null';

/** Class representing a cluster worker. */
export default class Worker {
    /**
     * Create a new Worker.
     */
    constructor(frontendConfig) {
        this.frontendConfig = frontendConfig;
    }

    /**
     * Initialize the worker process.  Set up HTTP/Socket.IO instances.
     */
    initialize() {
        logger.info('Initializing worker process');
        this.initMetrics();

        this.redisClientProvider = new RedisClientProvider(
                this.frontendConfig.getRedisConfig()
        );
        this.database = new Database(this.frontendConfig.getKnexConfig());
        this.httpServer = http.createServer();
        this.initHttpsIfNeeded();
        this.ioFrontend = new IOFrontendNode(this.redisClientProvider,
                this.frontendConfig,
                this.httpServer,
                this.httpsServer,
                this.database);
        process.on('message', this.onProcessMessage.bind(this));
    }

    initMetrics() {
        const reporter = new JSONFileMetricsReporter(METRICS_FILENAME);
        Metrics.setReporter(reporter);
        Metrics.setReportInterval(this.frontendConfig.getMetricsReportInterval());
    }

    initHttpsIfNeeded() {
        const hasTLSListener = this.frontendConfig.getListenerConfig().filter(
                listener => listener.tls
        ).length > 0;
        if (hasTLSListener) {
            this.httpsServer = https.createServer(this.getTLSOptions());
        } else {
            this.httpsServer = null;
        }
    }

    getTLSOptions() {
        const config = this.frontendConfig.getTLSConfig();
        const options = {};

        if (config.pfx) {
            try {
                options.pfx = fs.readFileSync(config.pfx);
            } catch (error) {
                logger.error(`Unable to load pfx file: ${error.stack}`);
                process.exit(WORKER_FATAL);
            }
        } else {
            try {
                options.key = fs.readFileSync(config.key);
                options.cert = fs.readFileSync(config.cert);
                if (config.ca) {
                    options.ca = fs.readFileSync(config.ca);
                }
            } catch (error) {
                logger.error(`Unable to load TLS files: ${error.stack}`);
                process.exit(WORKER_FATAL);
            }
        }

        if (config.passphrase) {
            options.passphrase = config.passphrase;
        }

        if (config.dhparam) {
            try {
                options.dhparam = fs.readFileSync(config.dhparam);
            } catch (error) {
                logger.error(`Unable to load dhparam file: ${error.stack}`);
                process.exit(WORKER_FATAL);
            }
        }

        return options;
    }

    /**
     * Handle a message received from the cluster master via IPC.
     *
     * @param {object} message Object containing information from master process.
     * @param {Socket} socket Optional socket instance passed from the master process.
     * @private
     */
    onProcessMessage(message, socket) {
        if (typeof message !== 'object' || message.type !== 'connection') {
            return;
        }

        logger.debug(`Received connection from ${message.realIP}`);

        if (!socket) {
            Metrics.incCounter(COUNTER_RECEIVE_NULL_SOCKET);
            logger.warn(`Received null socket from master (IP: ${message.realIP})`);
            return;
        }

        Metrics.incCounter(COUNTER_RECEIVE_SOCKET);
        // The master process had to read the HTTP headers in order to
        // hash the X-Forwarded-For IP address.  Unshift this data back into
        // the socket queue so that the HTTP/Socket.IO server can still
        // read it.
        const initialData = new Buffer(message.initialData, 'base64');
        socket.unshift(initialData);

        if (message.tlsConnection) {
            if (this.httpsServer === null) {
                logger.error(`Unexpected TLS connection received, rejecting.`);
                try {
                    socket.close();
                } catch (error) {
                    logger.error(`Error closing socket: ${error}`);
                }
                return;
            }
            this.httpsServer.emit('connection', socket);
        } else {
            this.httpServer.emit('connection', socket);
        }
        socket.resume();
    }
}
