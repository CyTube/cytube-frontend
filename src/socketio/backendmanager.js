import Connection from 'cytube-common/lib/tcpjson/connection';
import net from 'net';

export default class BackendManager {
    constructor() {
        this.backendConnections = {};
    }

    connect(address) {
        if (this.backendConnections.hasOwnProperty(address)) {
            return this.backendConnections[address];
        }

        return this.backendConnections[address] = this.newConnection(address);
    }

    newConnection(address) {
        const [host, port] = address.split(',');
        const socket = net.connect(port, host);
        const connection = new Connection(socket);

        return connection;
    }
}
