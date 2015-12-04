import cluster from 'cluster';
import net from 'net';
import winston from '../logger';
import ipUtil from 'ip';

const X_FORWARDED_FOR = /x-forwarded-for: (.*)\r\n/i;

/** Cluster master */
export default class Master {
    /**
     * Create a Master object.
     *
     * @param {ClusterConfiguration} clusterConfig cluster configuration.
     * @param {WebConfiguration} webConfig webserver configuration.
     */
    constructor(clusterConfig, webConfig) {
        this.clusterConfig = clusterConfig;
        this.webConfig = webConfig;
        this.listeners = [];
        this.workerPool = [];
    }

    /**
     * Initialize the cluster.  Spawn workers.
     *
     * @throws {Error} Cannot initialize socket cluster from a worker process.
     */
    initialize() {
        if (!cluster.isMaster) {
            winston.error('Cannot initialize socket cluster from a worker process');
            throw new Error('Cannot initialize socket cluster from a worker process');
        }

        const numProcesses = this.clusterConfig.getProcessCount();
        winston.info(`Spawning ${numProcesses} workers`);

        for (let i = 0; i < numProcesses; i++) {
            this._forkWorker();
        }

        this.clusterConfig.getListenerConfig().forEach(this._bindListener.bind(this));
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
        winston.error(`Worker ${worker.id} exited with code ${code}`);
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
        const listener = net.createServer(this._handleConnection.bind(this));

        listener.on('error', err => {
            winston.error(`Listener on [${host}:${port}] caught error: ${err.stack}`);
        });

        listener.on('listening', () => {
            winston.info(`Listening on [${host}:${port}]`);
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
    _handleConnection(socket) {
        socket.once('data', buffer => {
            socket.pause();
            const ip = this._ipForSocket(socket, buffer);
            const workerIndex = this.stickyHash(ip, this.workerPool.length);
            const destinationWorker = this.workerPool[workerIndex];
            destinationWorker.send({
                type: 'connection',
                initialData: buffer.toString('base64'),
                realIP: ip
            }, socket);
        });
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
        const directIP = socket.remoteAddress;
        if (!this.webConfig.isTrustedProxy(directIP)) {
            return directIP;
        }

        const data = buffer.toString('utf8');
        const match = X_FORWARDED_FOR.exec(data);
        if (!match) {
            return directIP;
        }

        const ipList = match[1].split(',').map(ip => ip.trim())
                .filter(ip => net.isIP(ip));
        if (ipList.length > 0) {
            return ipList[0];
        } else {
            return directIP;
        }
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
