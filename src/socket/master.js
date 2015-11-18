import cluster from 'cluster';
import net from 'net';
import winston from '../logger';
import ipUtil from 'ip';

const X_FORWARDED_FOR = /x-forwarded-for: (.*)\r\n/i;
const listeners = [];
const workerPool = [];

function stickyHashAddress(address, poolSize) {
    if (net.isIPv4(address)) {
        return Number(address.replace(/\./g, '')) % poolSize;
    } else if (net.isIPv6(address)) {
        throw new Error(`Cannot stickyHash ${address}: IPv6 is not supported yet`);
    } else {
        throw new Error(`Cannot stickyHash "${address}": not an IP address`);
    }
}

/** Cluster master */
export default class Master {
    /**
     * Create a Master object.
     *
     * @param {IOConfiguration} ioConfig socket.io configuration.
     * @param {WebConfiguration} webConfig webserver configuration.
     */
    constructor(ioConfig, webConfig) {
        this.ioConfig = ioConfig;
        this.webConfig = webConfig;
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

        const numProcesses = this.ioConfig.getProcessCount();
        winston.info(`Spawning ${numProcesses} workers`);

        for (let i = 0; i < numProcesses; i++) {
            workerPool.push(cluster.fork({
                WORKER_MODULE: './lib/socket/worker',
                IO_CONFIG: JSON.stringify(this.ioConfig.config)
            }));
        }

        this.ioConfig.getListenerConfig().forEach(this._bindListener.bind(this));
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
        listeners.push(listener);
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
            const destinationWorker = workerPool[this.stickyHash(ip, workerPool.length)];
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
