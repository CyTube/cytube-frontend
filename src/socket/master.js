import cluster from 'cluster';
import net from 'net';
import winston from 'winston';

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

export default function initialize(ioConfig) {
    if (!cluster.isMaster) {
        winston.error('Cannot initialize socket cluster from a worker process');
        throw new Error('Cannot initialize socket cluster from a worker process');
    }

    const numProcesses = ioConfig.getProcessCount();
    winston.debug(`Spawning ${numProcesses} workers`);

    for (let i = 0; i < numProcesses; i++) {
        workerPool.push(cluster.fork('./worker'));
    }

    ioConfig.getListenerConfig().forEach(listenerConfig => {
        const { host, port } = listenerConfig;
        const listener = net.createServer({
            pauseOnConnect: true
        }, connection => {
            try {
                const index = stickyHashAddress(connection.remoteAddress,
                        workerPool.length);
                workerPool[index].send('connection', connection);
                winston.info(`Sending connection from ${connection.remoteAddress} ` +
                        `to worker-${index}`);
            } catch (err) {
                winston.error(`Error in connection handler: ${err.message}`);
            }
        });

        listener.on('error', err => {
            winston.error(`Listener on [${host}:${port}] caught error: ${err.stack}`);
        });

        listener.on('listening', () => {
            winston.info(`Listening on [${host}:${port}]`);
        });

        listener.listen(port, host);
    });
}
