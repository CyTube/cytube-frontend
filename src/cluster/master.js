import cluster from 'cluster';
import net from 'net';
import logger from 'cytube-common/lib/logger';
import { resolveIP } from 'cytube-common/lib/util/x-forwarded-for';
import ipUtil from 'ip';
import PoolEntryUpdater from 'cytube-common/lib/redis/poolentryupdater';
import uuid from 'uuid';
import RedisClientProvider from 'cytube-common/lib/redis/redisclientprovider';

const FRONTEND_POOL = 'frontend-hosts';
const X_FORWARDED_FOR = /x-forwarded-for: (.*)\r\n/i;
// Arbitrarily chosen exit code not already used by node.js.
// Returned when a fatal error occurs that should terminate
// the entire process and not just respawn the worker.
const WORKER_FATAL = 55;

/** Cluster master */
export default class Master {
    /**
     * Create a Master object.
     *
     * @param {FrontendConfiguration} frontendConfig frontend configuration.
     */
    constructor(frontendConfig) {
        this.frontendConfig = frontendConfig;
        this.listeners = [];
        this.workerPool = [];
        this.frontendPoolUpdaters = [];
    }

    /**
     * Initialize the cluster.  Spawn workers.
     *
     * @throws {Error} Cannot initialize socket cluster from a worker process.
     */
    initialize() {
        if (!cluster.isMaster) {
            logger.error('Cannot initialize socket cluster from a worker process');
            throw new Error('Cannot initialize socket cluster from a worker process');
        }

        const numProcesses = this.frontendConfig.getProcessCount();
        logger.info(`Spawning ${numProcesses} workers`);

        for (let i = 0; i < numProcesses; i++) {
            this._forkWorker();
        }

        const redisClientProvider = new RedisClientProvider(
                this.frontendConfig.getRedisConfig()
        );
        this.frontendPoolRedisClient = redisClientProvider.get();

        this.frontendConfig.getListenerConfig().forEach(this._bindListener.bind(this));
    }

    /**
     * Spawn a new worker process.
     *
     * @private
     */
    _forkWorker() {
        const worker = cluster.fork();
        worker.on('exit', this.onWorkerExit.bind(this, worker));
        this.workerPool.push(worker);
    }

    /**
     * Callback for when a worker process exits.  Restarts a new worker.
     *
     * @param {object} worker Worker that exited.
     * @param {number} code Return code from the worker.
     * @private
     */
    onWorkerExit(worker, code) {
        logger.error(`Worker ${worker.id} exited with code ${code}`);
        if (code === WORKER_FATAL) {
            logger.error(`Worker ${worker.id} reported a fatal error, exiting.`);
            process.exit(1);
        }

        const index = this.workerPool.indexOf(worker);
        if (index >= 0) {
            this.workerPool.splice(index, 1);
        }

        this._forkWorker();
    }

    /**
     * Bind a network listener to the host and port specified by the given
     * configuration object.
     *
     * @param {object} listenerConfig The configuration for this listener.
     * @private
     */
    _bindListener(listenerConfig) {
        const { host, port } = listenerConfig;
        const listener = net.createServer(this._handleConnection.bind(this,
                Boolean(listenerConfig.tls)));

        listener.on('error', err => {
            logger.error(`Listener on [${host}:${port}] caught error: ${err.stack}`);
        });

        listener.on('listening', () => {
            logger.info(`Listening on [${host}:${port}]`);
            this.registerFrontendPool(listenerConfig);
        });

        listener.listen(port, host);
        this.listeners.push(listener);
    }

    /**
     * Handle an incoming connection.  Parse the X-Forwarded-For header
     * (if necessary), sticky hash the remote address, and pass the connection
     * to a worker process.
     *
     * @param {Socket} socket The incoming socket.
     * @private
     */
    _handleConnection(isTLSConnection, socket) {
        socket.once('data', buffer => {
            socket.pause();
            const ip = this._ipForSocket(socket, buffer);
            const workerIndex = this.stickyHash(ip, this.workerPool.length);
            const destinationWorker = this.workerPool[workerIndex];
            destinationWorker.send({
                type: 'connection',
                initialData: buffer.toString('base64'),
                realIP: ip,
                tlsConnection: isTLSConnection
            }, socket);
        });
    }

    /**
     * Register a listener in the frontend pool in Redis by creating
     * a PoolEntryUpdater for this listener's clientAddress.
     *
     * @param {object} listenerConfig listener to publish to the pool
     */
    registerFrontendPool(listenerConfig) {
        const entry = {
            address: listenerConfig.clientAddress
        };

        const updater = new PoolEntryUpdater(
                this.frontendPoolRedisClient,
                FRONTEND_POOL,
                uuid.v4(),
                entry
        );

        updater.start();
        this.frontendPoolUpdaters.push(updater);
    }

    /**
     * Get the IP address of a socket, parsing the X-Forwarded-For header
     * if present.
     *
     * @param {Socket} socket The Socket to get the remote IP address of.
     * @param {Buffer} buffer The initial data received from the socket.
     * @return {string} The remote IP address of the socket.
     * @private
     */
    _ipForSocket(socket, buffer) {
        const realIP = socket.remoteAddress;
        const data = buffer.toString('utf8');
        const match = X_FORWARDED_FOR.exec(data);
        if (!match) {
            return realIP;
        }

        return resolveIP(this.frontendConfig, realIP, match[1]);
    }

    /**
     * Sticky hashes an IP address.  Adapted from
     * https://github.com/indutny/sticky-session/blob/master/lib/sticky/master.js
     *
     * @param {string} ip IP address, in string form.
     * @param {number} max Maximum value of the hash output.
     * @return {number} An integer in the range [0, max)
     */
    stickyHash(ip, max) {
        const binaryIP = ipUtil.toBuffer(ip);
        let hash = this.hashSeed;

        for (let i = 0; i < binaryIP.length; i++) {
            const n = ip[i];
            hash += n;
            hash %= 2147483648;
            hash += (hash << 10);
            hash %= 2147483648;
            hash ^= hash >> 6;
        }

        hash += hash << 3;
        hash %= 2147483648;
        hash ^= hash >> 11;
        hash += hash << 15;
        hash %= 2147483648;

        return (hash >>> 0) % max;
    }
}
