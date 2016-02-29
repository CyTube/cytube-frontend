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
            logger.warn(`Channel::onSocketJoin called twice for socket: ${socket.id}` +
                    `(channel: ${this.name})`);
            return;
        }

        logger.info(`${socket.ip} joined channel ${this.name}`);
        socket.on('disconnect', this.onSocketDisconnect.bind(this, socket));

        this.sockets.push(socket);
        this.backendConnection.write(
                this.backendConnection.protocol.newSocketConnectEvent(
                        socket.id,
                        socket.ip,
                        socket.user
                )
        );
        this.backendConnection.write(
                this.backendConnection.protocol.newSocketFrameEvent(socket.id, 'joinChannel', [{
                    name: this.name
                }])
        );
        let event;
        while ((event = socket.bufferedFrames.shift()) !== undefined) {
            logger.debug(`bufferedFrames: write ${event.name}`);
            this.backendConnection.write(
                this.backendConnection.protocol.newSocketFrameEvent(socket.id, event.name, event.args)
            );
        }
    }

    onSocketDisconnect(socket) {
        const index = this.sockets.indexOf(socket);
        if (index >= 0) {
            this.sockets.splice(index, 1);
        }

        this.backendConnection.write(
                this.backendConnection.protocol.newSocketDisconnectEvent(socket.id)
        );

        if (this.sockets.length === 0) {
            this.emit('empty');
        }
    }

    onSocketEvent(socket, event, args) {
        this.backendConnection.write(
                this.backendConnection.protocol.newSocketFrameEvent(socket.id, event, args)
        );
    }

    onBackendDisconnect() {
        this.sockets.forEach(socket => {
            // Prevent write-after-end on the channel backend connection
            socket.channel = null;
            // TODO: emit error frame
            socket.disconnect();
        });
    }
}
