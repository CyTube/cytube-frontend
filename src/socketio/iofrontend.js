import { EventEmitter } from 'events';
import socketio from 'socket.io';
import redisAdapter from 'socket.io-redis';
import logger from 'cytube-common/lib/logger';
import uuid from 'uuid';
import ChannelConnectionResolver from './redis/channelconnectionresolver';
import ConnectionManager from 'cytube-common/lib/tcpjson/connectionmanager';
import ChannelManager from './channelmanager';
import SocketManager from './socketmanager';

export default class IOFrontendNode {
    constructor(redisClientProvider, httpServer) {
        this.redisClientProvider = redisClientProvider;
        this.id = uuid.v4();
        this.ioServer = null;
        this.init(httpServer);
    }

    init(httpServer) {
        logger.info('Initializing socket.io server');
        this.ioServer = socketio();

        const adapter = redisAdapter({
            pubClient: this.redisClientProvider.get(),
            // socket.io-redis won't function properly unless the received
            // message is returned as a Buffer
            subClient: this.redisClientProvider.get({ return_buffers: true })
        });
        this.ioServer.adapter(adapter);

        this.ioServer.on('connection', this.onConnection.bind(this));
        this.ioServer.attach(httpServer);

        this.initManagers();
    }

    initManagers() {
        this.backendConnectionManager = new ConnectionManager();
        this.socketManager = new SocketManager();
        const backendResolver = new ChannelConnectionResolver(
                this.redisClientProvider.get()
        );
        this.channelManager = new ChannelManager(
                this.backendConnectionManager,
                backendResolver
        );
        this.socketManager.on('joinChannel',
                this.channelManager.onSocketJoinChannel.bind(this.channelManager)
        );
    }

    /**
     * Handle a new socket.io connection.
     *
     * @param {Socket} socket Incoming socket.io Socket object.
     * @private
     */
    onConnection(socket) {
        logger.info(`socket.io received connection from ${socket.conn.remoteAddress}`);
        socket.ip = socket.conn.remoteAddress;
        this.socketManager.onConnection(socket);
        socket.on('disconnect', this.onSocketDisconnect.bind(this, socket));
    }

    /**
     * Handle a socket.io disconnect event.
     *
     * @param {Socket} socket Socket.io client that disconnected.
     * @private
     */
    onSocketDisconnect(socket) {
        logger.info(`${socket.ip} disconnected`);
    }
}
