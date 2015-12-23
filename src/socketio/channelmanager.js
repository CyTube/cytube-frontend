import Promise from 'bluebird';
import Channel from './channel';
import logger from 'cytube-common/lib/logger';

export default class ChannelManager {
    constructor(nodeID, backendConnectionManager, channelConnectionResolver) {
        this.nodeID = nodeID;
        this.backendConnectionManager = backendConnectionManager;
        this.channelConnectionResolver = channelConnectionResolver;
        this.channels = {};
    }

    onSocketJoinChannel(socket, name) {
        this.findOrCreateChannel(name).then(channel => {
            socket.channel = channel;
            channel.onSocketJoin(socket);
        });
    }

    findOrCreateChannel(name) {
        const channel = this.channels[name];
        if (channel) {
            return Promise.resolve(channel);
        }

        return this.createNewChannel(name);
    }

    createNewChannel(name) {
        logger.info(`Creating local channel ${name}`);
        return this.channelConnectionResolver.resolve(name).then(address => {
            if (this.channels[name]) {
                logger.error(`createNewChannel: already created channel ${name}`);
                return this.channels[name];
            }

            logger.info(`Resolved channel ${name} to backend address [${address}]`);
            const connection = this.backendConnectionManager.connect(address);
            const channel = this.channels[name] = new Channel(name,
                    connection, this.nodeID);

            channel.on('empty', this.onChannelEmpty.bind(this, channel));
            return channel;
        });
    }

    onChannelEmpty(channel) {
        if (channel.sockets.length > 0) {
            logger.warn(`onChannelEmpty called for channel "${channel.name}" ` +
                    `with ${channel.sockets.length} sockets remaining.  Ignoring.`);
            return;
        }

        logger.info(`Deleting channel ${channel.name}`);
        delete this.channels[channel.name];
    }
}
