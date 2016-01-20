import Promise from 'bluebird';
import Channel from './channel';
import logger from 'cytube-common/lib/logger';

export default class ChannelManager {
    constructor(backendConnectionManager, channelConnectionResolver) {
        this.backendConnectionManager = backendConnectionManager;
        this.channelConnectionResolver = channelConnectionResolver;
        this.channels = {};
        this.connectionChannelMap = {};
        this.pendingChannels = {};
    }

    onSocketJoinChannel(socket, name) {
        this.findOrCreateChannel(name).then(channel => {
            socket.channel = channel;
            process.nextTick(() => {
                channel.onSocketJoin(socket);
            });
        }).catch(error => {
            logger.error(`ChannelManager::onSocketJoinChannel(${socket.id}, ${name}): ` +
                    `Unable to resolve channel: ${error}`);
        });
    }

    findOrCreateChannel(name) {
        const channel = this.channels[name];
        if (channel) {
            return Promise.resolve(channel);
        } else if (this.pendingChannels.hasOwnProperty(name)) {
            return this.pendingChannels[name];
        }

        return this.createNewChannel(name);
    }

    createNewChannel(name) {
        logger.info(`Creating local channel ${name}`);
        this.pendingChannels[name] = this.channelConnectionResolver
                .resolve(name).then(address => {
            if (this.channels[name]) {
                logger.error(`createNewChannel: already created channel ${name}`);
                return this.channels[name];
            }

            logger.info(`Resolved channel ${name} to backend address [${address}]`);
            const connection = this.backendConnectionManager.connect(address);
            const channel = this.channels[name] = new Channel(
                    name,
                    connection
            );
            channel.on('empty', this.onChannelEmpty.bind(this, channel));

            if (this.connectionChannelMap.hasOwnProperty(address)) {
                this.connectionChannelMap[address].push(channel);
            } else {
                this.connectionChannelMap[address] = [channel];
                this.bindBackendDisconnectEvents(connection);
            }
            delete this.pendingChannels[name];
            return channel;
        });

        return this.pendingChannels[name];
    }

    bindBackendDisconnectEvents(connection) {
        connection.on('close', this.onBackendDisconnect.bind(this, connection));
    }

    onBackendDisconnect(connection) {
        const endpoint = connection.endpoint;
        if (this.connectionChannelMap.hasOwnProperty(endpoint)) {
            try {
                const channelList = this.connectionChannelMap[endpoint];
                const names = channelList.map(channel => channel.name).sort();
                if (channelList.length > 0) {
                    logger.warn(`Backend connection to [${endpoint}] was closed.  ` +
                            `Disconnecting channels [${names}]`);
                    channelList.forEach(channel => channel.onBackendDisconnect());
                }
            } finally {
                logger.debug(`Deleting endpoint ${endpoint}`);
                delete this.connectionChannelMap[endpoint];
            }
        }
    }

    onChannelEmpty(channel) {
        if (channel.sockets.length > 0) {
            logger.warn(`onChannelEmpty called for channel "${channel.name}" ` +
                    `with ${channel.sockets.length} sockets remaining.  Ignoring.`);
            return;
        }

        logger.info(`Closing channel ${channel.name}`);
        delete this.channels[channel.name];

        const connection = channel.backendConnection;

        if (this.connectionChannelMap.hasOwnProperty(connection.endpoint)) {
            const channelList = this.connectionChannelMap[connection.endpoint];
            const index = channelList.indexOf(channel);
            if (index >= 0) {
                channelList.splice(index, 1);
            }

            if (channelList.length === 0) {
                const endpoint = connection.endpoint;
                logger.info(`Closing connection [${endpoint}]` +
                        ' (no more channels left on this backend)');
                try {
                    this.backendConnectionManager.disconnect(connection);
                } finally {
                    delete this.connectionChannelMap[endpoint];
                }
            }
        }
    }
}
