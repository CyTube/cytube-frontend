import Socket from 'socket.io/lib/socket';
import { EventEmitter } from 'events';
import logger from 'cytube-common/lib/logger';

export default class SocketManager extends EventEmitter {
    constructor() {
        super();
        this.sockets = {};
        patchSocketIOEventProxy();
    }

    onConnection(socket) {
        this.sockets[socket.id] = socket;
        socket.on('proxied-event', this.onSocketEvent.bind(this, socket));
        socket.on('disconnect', this.onSocketDisconnect.bind(this, socket));
        socket.on('error', this.onSocketError.bind(this, socket));
    }

    onSocketError(socket, error) {
        logger.error(`socket:${socket.id}: ${error.stack}`);
    }

    /**
     * Handle a socket.io event from a client.
     *
     * @param {Socket} socket Socket.io client that emitted the event.
     * @param {string} event Event name.
     * @param {array} data Event data from the client.
     * @private
     */
    onSocketEvent(socket, event, ...data) {
        logger.debug(`socket:${socket.id} received ${event}`);
        switch (event) {
            case 'joinChannel':
                this.onJoinChannel.apply(this, [socket].concat(data));
                break;
            default: {
                if (socket.channel != null) {
                    socket.channel.onSocketEvent(socket, event, data);
                }
                break;
            }
        }
    }

    onSocketDisconnect(socket) {
        delete this.sockets[socket.id];
    }

    onJoinChannel(socket, data) {
        if (socket.channel) {
            // TODO: In the future, emit an error to the client
            logger.warn(`onJoinChannel: ${socket.id} is already in a channel`);
            return;
        }

        const name = data.name;
        // TODO: abstract out validation
        if (typeof name !== 'string' || !name.match(/^[\w-]{1,30}$/)) {
            return;
        }

        // TODO: Check for blacklisted channel
        this.emit('joinChannel', socket, name);
    }

    onSocketJoinRooms(socketID, rooms) {
        if (!this.sockets.hasOwnProperty(socketID)) {
            logger.warn(`onSocketJoinRooms: socket [${socketID}] does not exist`);
            return;
        }
        const socket = this.sockets[socketID];
        rooms.forEach(room => socket.join(room));
    }
}

/**
 * Patch Socket.IO's Socket prototype to emit a special
 * <code>'proxied-event'</code> event on every incoming event.
 */
function patchSocketIOEventProxy() {
    if (Socket.prototype.oneventPatched) {
        return;
    }

    const onevent = Socket.prototype.onevent;
    const emit = EventEmitter.prototype.emit;

    Socket.prototype.onevent = function onEvent(packet) {
        const args = packet.data ? packet.data.slice() : [];
        args.unshift('proxied-event');
        emit.apply(this, args);
        onevent.apply(this, arguments);
    };

    Socket.prototype.oneventPatched = true;
}
