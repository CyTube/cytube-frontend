import { EventEmitter } from 'events';
import socketio from 'socket.io';
import Socket from 'socket.io/lib/socket';
import redisAdapter from 'socket.io-redis';
import logger from '../logger';
import uuid from 'uuid';
import Subscriber from '../redis/subscriber';

export default class IOFrontendNode {
    constructor(redisClientProvider, httpServer) {
        this.redisClientProvider = redisClientProvider;
        this.id = uuid.v4();
        this.ioServer = null;
        this.sockets = {};
        this.init(httpServer);
    }

    init(httpServer) {
        logger.info('Initializing socket.io server');
        patchSocketIOEventProxy();
        this.ioServer = socketio();

        const adapter = redisAdapter({
            pubClient: this.redisClientProvider.get(true),
            subClient: this.redisClientProvider.get(true)
        });
        this.ioServer.adapter(adapter);

        this.ioServer.on('connection', this.onConnection.bind(this));
        this.ioServer.attach(httpServer);

        this.initMessageSubscriber();
    }

    initMessageSubscriber() {
        this.subscriber = new Subscriber(
                this.redisClientProvider.get(true),
                this.redisClientProvider.get(true),
                this.id,
                this.id
        );

        this.subscriber.on('message', this.onRedisMessage.bind(this));
        logger.info(`Subscribed to redis queue ${this.id}`);
    }

    onRedisMessage(message) {
        logger.debug(`Received redis message ${JSON.stringify(message)}`);
    }

    /**
     * Handle a new socket.io connection.
     *
     * @param {Socket} socket Incoming socket.io Socket object.
     * @private
     */
    onConnection(socket) {
        logger.info(`socket.io received connection from ${socket.conn.remoteAddress}`);
        this.sockets[socket.id] = socket;
        socket.on('proxied-event', this.onSocketEvent.bind(this, socket));
        socket.on('disconnect', this.onSocketDisconnect.bind(this, socket));
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
    }

    /**
     * Handle a socket.io disconnect event.
     *
     * @param {Socket} socket Socket.io client that disconnected.
     * @private
     */
    onSocketDisconnect(socket) {
        delete this.sockets[socket.id];
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
