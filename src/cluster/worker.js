import cluster from 'cluster';
import http from 'http';
import logger from 'cytube-common/lib/logger';
import RedisClientProvider from 'cytube-common/lib/redis/redisclientprovider';
import IOFrontendNode from '../socketio/iofrontend';
import Database from 'cytube-common/lib/database/database';

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

        this.redisClientProvider = new RedisClientProvider(
                this.frontendConfig.getRedisConfig()
        );
        this.database = new Database(this.frontendConfig.getKnexConfig());
        this.httpServer = http.createServer();
        this.ioFrontend = new IOFrontendNode(this.redisClientProvider,
                this.frontendConfig,
                this.httpServer,
                this.database);
        process.on('message', this.onProcessMessage.bind(this));
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

        // The master process had to read the HTTP headers in order to
        // hash the X-Forwarded-For IP address.  Unshift this data back into
        // the socket queue so that the HTTP/Socket.IO server can still
        // read it.
        const initialData = new Buffer(message.initialData, 'base64');
        socket.unshift(initialData);

        this.httpServer.emit('connection', socket);
        socket.resume();
    }
}
