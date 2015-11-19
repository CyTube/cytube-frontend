import cluster from 'cluster';
import http from 'http';
import winston from '../logger';
import socketio from 'socket.io';
import Socket from 'socket.io/lib/socket';
import { EventEmitter } from 'events';
import Publisher from '../redis/publisher';

/** Class representing a cluster worker. */
export default class Worker {
    /**
     * Create a new Worker.
     */
    constructor(redisClientProvider, redisAdapter, ioConfig, webConfig) {
        this.redisClientProvider = redisClientProvider;
        this.redisAdapter = redisAdapter;
        this.ioConfig = ioConfig;
        this.webConfig = webConfig;
        this.sockets = {};
    }

    /**
     * Initialize the worker process.  Set up HTTP/Socket.IO instances.
     */
    initialize() {
        winston.info('Initializing worker process');

        this.httpServer = http.createServer();
        this.ioServer = socketio();
        this.ioServer.attach(this.httpServer);
        this.ioServer.adapter(this.redisAdapter);

        process.on('message', this.onProcessMessage.bind(this));
        this.ioServer.on('connection', this.onConnection.bind(this));
    }

    /**
     * Handle a message received from the cluster master via IPC.
     *
     * @param {object} message Object containing information from master process.
     * @param {Socket} socket Optional socket instance passed from the master process.
     * @private
     */
    onProcessMessage(message, socket) {
        if (typeof message !== 'object' || message.type !== 'connection') {
            return;
        }

        winston.debug(`Received connection from ${message.realIP}`);

        // The master process had to read the HTTP headers in order to
        // hash the X-Forwarded-For IP address.  Unshift this data back into
        // the socket queue so that the HTTP/Socket.IO server can still
        // read it.
        const initialData = new Buffer(message.initialData, 'base64');
        socket.unshift(initialData);

        this.httpServer.emit('connection', socket);
        socket.resume();
    }

    /**
     * Handle a new socket.io connection.
     *
     * @param {Socket} socket Incoming socket.io Socket object.
     * @private
     */
    onConnection(socket) {
        winston.info(`socket.io received connection from ${socket.conn.remoteAddress}`);
        socket.on('proxied-event', this.onSocketEvent.bind(this, socket));
        socket.on('disconnect', this.onSocketDisconnect.bind(this, socket));
    }

    /**
     * Handle a socket.io event from a client.
     *
     * @param {Socket} socket Socket.io client that emitted the event.
     * @param {string} event Event name.
     * @param {object} data Event data from the client.
     * @private
     */
    onSocketEvent(socket, event, data) {

    }

    /**
     * Handle a socket.io disconnect event.
     *
     * @param {Socket} socket Socket.io client that disconnected.
     * @private
     */
    onSocketDisconnect(socket) {

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
}

patchSocketIOEventProxy();
