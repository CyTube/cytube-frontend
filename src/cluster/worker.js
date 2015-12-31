import cluster from 'cluster';
import http from 'http';
import winston from 'cytube-common/lib/logger';
import RedisClientProvider from 'cytube-common/lib/redis/redisclientprovider';
import IOFrontendNode from '../socketio/iofrontend';

/** Class representing a cluster worker. */
export default class Worker {
    /**
     * Create a new Worker.
     */
    constructor(frontendConfig) {
        this.frontendConfig = frontendConfig;
        this.redisClientProvider = new RedisClientProvider(
                frontendConfig.getRedisConfig()
        );
    }

    /**
     * Initialize the worker process.  Set up HTTP/Socket.IO instances.
     */
    initialize() {
        winston.info('Initializing worker process');

        this.httpServer = http.createServer();
        this.ioFrontend = new IOFrontendNode(this.redisClientProvider,
                this.httpServer);
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

        winston.debug(`Received connection from ${message.realIP}`);

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
