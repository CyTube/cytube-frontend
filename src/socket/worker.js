import cluster from 'cluster';
import http from 'http';
import winston from '../logger';
import socketio from 'socket.io';
import redisAdapter from 'socket.io-redis';
import Socket from 'socket.io/lib/socket';
import { EventEmitter } from 'events';
import Publisher from '../redis/publisher';

export default function initialize(ioConfig, redisClientFactory) {
    winston.info(`Initializing worker process`);
    patchSocketIOEventProxy();

    const httpServer = http.createServer();
    const ioServer = socketio();
    ioServer.attach(httpServer);
    ioServer.adapter(redisAdapter(redisClientFactory.create()));

    function onMessage(message, socket) {
        if (typeof message !== 'object' || message.type !== 'connection') {
            return;
        }

        const initialData = new Buffer(message.initialData, 'base64');
        socket.unshift(initialData);

        winston.debug(`Received connection from ${message.realIP}`);
        httpServer.emit('connection', socket);
        socket.resume();
    }

    process.on('message', onMessage);

    const publisher = new Publisher(redisClientFactory.create(), 'test', 'test');
    ioServer.on('connection', socket => {
        winston.info(`socket.io accepted connection from ${socket.conn.remoteAddress}`);
        publisher.publish({
            type: 'socketConnected',
            socketID: socket.id,
            address: socket.conn.remoteAddress
        });

        socket.on('proxied-event', function (event) {
            winston.debug(`(socket-${socket.id}) Intercepted event ${event}`);
            const args = Array.prototype.slice.call(arguments);
            publisher.publish({
                type: 'socketFrame',
                socketID: socket.id,
                args: args
            });
        });

        socket.on('disconnect', () => {
            publisher.publish({
                type: 'socketDisconnect',
                socketID: socket.id
            });
        });
    });
}

function patchSocketIOEventProxy() {
    const onevent = Socket.prototype.onevent;
    const emit = EventEmitter.prototype.emit;

    Socket.prototype.onevent = function (packet) {
        const args = packet.data ? packet.data.slice() : [];
        args.unshift('proxied-event');
        emit.apply(this, args);
        onevent.apply(this, arguments);
    };
}
