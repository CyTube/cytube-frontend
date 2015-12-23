import { EventEmitter } from 'events';
import logger from 'cytube-common/lib/logger';

export default class Channel extends EventEmitter {
    constructor(name, backendConnection, nodeID) {
        super();
        this.name = name;
        this.backendConnection = backendConnection;
        this.nodeID = nodeID;
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
        this.backendConnection.write({
            action: 'socketConnect',
            socketID: socket.id,
            socketData: {
                ip: socket.ip
            },
            nodeID: this.nodeID
        });
        this.backendConnection.write({
            action: 'socketFrame',
            socketID: socket.id,
            args: [
                'joinChannel',
                { name: this.name }
            ]
        });
    }

    onSocketDisconnect(socket) {
        const index = this.sockets.indexOf(socket);
        if (index >= 0) {
            this.sockets.splice(index, 1);
        }

        this.backendConnection.write({
            action: 'socketDisconnect',
            socketID: socket.id
        });

        if (this.sockets.length === 0) {
            this.emit('empty');
        }
    }

    onSocketEvent(socket, args) {
        this.publisher.publish({
            action: 'socketFrame',
            socketID: socket.id,
            args: args
        });
    }
}
