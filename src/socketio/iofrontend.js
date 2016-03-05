import { EventEmitter } from 'events';
import socketio from 'socket.io';
import redisAdapter from 'socket.io-redis';
import logger from 'cytube-common/lib/logger';
import uuid from 'uuid';
import ChannelConnectionResolver from './redis/channelconnectionresolver';
import ConnectionManager from 'cytube-common/lib/proxy/connectionmanager';
import ChannelManager from './channelmanager';
import SocketManager from './socketmanager';
import cookieParser from 'cookie-parser';
import { resolveIP } from 'cytube-common/lib/util/x-forwarded-for';
import JSONProtocol from 'cytube-common/lib/proxy/protocol';

export default class IOFrontendNode {
    constructor(redisClientProvider, frontendConfig, httpServer, httpsServer,
            database) {
        this.redisClientProvider = redisClientProvider;
        this.frontendConfig = frontendConfig;
        this.database = database;
        this.id = uuid.v4();
        this.ioServer = null;
        this.init(httpServer, httpsServer);
    }

    init(httpServer, httpsServer) {
        logger.info('Initializing socket.io server');
        this.ioServer = socketio({
            perMessageDeflate: false
        });

        const adapter = redisAdapter({
            pubClient: this.redisClientProvider.get(),
            // socket.io-redis won't function properly unless the received
            // message is returned as a Buffer
            subClient: this.redisClientProvider.get({ return_buffers: true })
        });
        this.ioServer.adapter(adapter);

        this.cookieParser = cookieParser(this.frontendConfig.getCookieSecret());
        this.ioServer.use(this.authorizeSocket.bind(this));
        this.ioServer.on('connection', this.onConnection.bind(this));
        this.ioServer.attach(httpServer);
        if (httpsServer !== null) {
            this.ioServer.attach(httpsServer);
        }

        this.initManagers();
    }

    initManagers() {
        this.backendConnectionManager = new ConnectionManager(new JSONProtocol());
        this.backendConnectionManager.on('connection', this.onBackendConnection.bind(this));
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

    onBackendConnection(connection) {
        connection.on('SocketJoinRoomsEvent', this.onSocketJoinRooms.bind(this));
    }

    onSocketJoinRooms(socketID, roomList) {
        this.socketManager.onSocketJoinRooms(socketID, roomList);
    }

    authorizeSocket(socket, cb) {
        const req = socket.request;
        socket.user = null;
        socket.ip = resolveIP(this.frontendConfig, socket.conn.remoteAddress,
                req.headers['x-forwarded-for']);

        if (req.headers.cookie) {
            this.cookieParser(req, null, () => {
                const sessionCookie = req.signedCookies.auth;
                if (!sessionCookie) {
                    return cb(null, true);
                }

                const User = this.database.models.User;
                User.verifySession(sessionCookie).then(user => {
                    socket.user = {
                        name: user.get('name'),
                        globalRank: user.get('global_rank')
                    };

                    logger.info(`Authenticated ${socket.ip} as ${user.get('name')}`);
                    return cb(null, true);
                }).catch(error => {
                    return cb(null, true);
                });
            });
        } else {
            return cb(null, true);
        }
    }

    /**
     * Handle a new socket.io connection.
     *
     * @param {Socket} socket Incoming socket.io Socket object.
     * @private
     */
    onConnection(socket) {
        logger.info(`socket.io received connection from ${socket.ip}`);
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
