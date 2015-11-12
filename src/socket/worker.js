import cluster from 'cluster';
import http from 'http';
import winston from '../logger';
import socketio from 'socket.io';
import Socket from 'socket.io/lib/socket';
import { EventEmitter } from 'events';

export default function initialize(ioConfig) {
    winston.info(`Initializing worker process`);
    patchSocketIOEventProxy();

    const httpServer = http.createServer();
    const ioServer = socketio();
    ioServer.attach(httpServer);

    function onMessage(message, socket) {
        if (message !== 'connection') {
            return;
        }

        winston.debug(`Received connection from ${socket.remoteAddress}`);
        httpServer.emit('connection', socket);
        socket.resume();
    }

    process.on('message', onMessage);
    ioServer.on('connection', socket => {
        winston.info(`socket.io accepted connection from ${socket.conn.remoteAddress}`);

        socket.on('proxied-event', event => {
            winston.debug(`(socket-${socket.id}) Intercepted event ${event}`);
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
