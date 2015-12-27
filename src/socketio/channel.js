import { EventEmitter } from 'events';
import logger from 'cytube-common/lib/logger';

export default class Channel extends EventEmitter {
    constructor(name, backendConnection) {
        super();
        this.name = name;
        this.backendConnection = backendConnection;
        this.sockets = [];
    }

    onSocketJoin(socket) {
        if (this.sockets.indexOf(socket) >= 0) {
            logger.error(`socket:${socket.id} attempted to join ` +
                    `channel:${this.name} twice`);
            return;
        }

        socket.on('disconnect', this.onSocketDisconnect.bind(this, socket));

        this.sockets.push(socket);
        this.backendConnection.write(
                this.backendConnection.protocol.socketConnect(socket.id, socket.ip)
        );
        this.backendConnection.write(
                this.backendConnection.protocol.socketFrame(socket.id, 'joinChannel', [{
                    name: this.name
                }])
        );
    }

    onSocketDisconnect(socket) {
        const index = this.sockets.indexOf(socket);
        if (index >= 0) {
            this.sockets.splice(index, 1);
        }

        this.backendConnection.write(
                this.backendConnection.protocol.socketDisconnect(socket.id)
        );

        if (this.sockets.length === 0) {
            this.emit('empty');
        }
    }

    onSocketEvent(socket, event, args) {
        this.backendConnection.write(
                this.backendConnection.protocol.socketFrame(socket.id, event, args)
        );
    }

    onBackendDisconnect() {
        this.sockets.forEach(socket => {
            // TODO: emit error frame
            socket.disconnect();
        });
    }
}
