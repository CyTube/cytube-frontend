import { EventEmitter } from 'events';
import socketio from 'socket.io';
import redisAdapter from 'socket.io-redis';
import logger from '../logger';
import uuid from 'uuid';
import Subscriber from '../redis/subscriber';
import LockTimer from '../redis/locktimer';
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
            pubClient: this.redisClientProvider.get(true),
            subClient: this.redisClientProvider.get(true)
        });
        this.ioServer.adapter(adapter);

        this.ioServer.on('connection', this.onConnection.bind(this));
        this.ioServer.attach(httpServer);

        this.initMessageSubscriber();
        this.initHealthCheck();
        this.initManagers();
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

    initHealthCheck() {
        this.healthTimer = new LockTimer(this.redisClientProvider.get(true),
                this.id + ':alive',
                10); // TODO replace with configurable value
        this.healthTimer.on('soft timeout', this.onSoftTimeout.bind(this));
        this.healthTimer.on('hard timeout', this.onHardTimeout.bind(this));
    }

    initManagers() {
        this.socketManager = new SocketManager();
        this.channelManager = new ChannelManager();

        this.socketManager.on('joinChannel',
                this.channelManager.onSocketJoinChannel.bind(this.channelManager));
    }

    /**
     * Handle a soft timeout.  Occurs when the health check key in Redis for
     * this node expires, which means the backend will assume this frontend
     * shard is dead.  Attempt to rejoin remaining users on this shard to
     * their respective channels.
     */
    onSoftTimeout() {
        logger.warn(`${this.id}: soft timeout`);
    }

    /**
     * Handle a hard timeout.  Occurs when the health check timer is unable
     * to write to Redis for 2x the timer interval.  In this case, all users
     * should be disconnected from this node so that they may reconnect to
     * a healthy one.
     */
    onHardTimeout() {
        logger.warn(`${this.id}: hard timeout`);
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
