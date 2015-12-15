import Publisher from 'cytube-common/lib/redis/publisher';
import Channel from './channel';
import logger from 'cytube-common/lib/logger';

export default class ChannelManager {
    constructor(nodeID, redisClient) {
        this.nodeID = nodeID;
        this.redisClient = redisClient;
        this.channels = {};
    }

    onSocketJoinChannel(socket, name) {
        let channel = this.channels[name];
        if (!channel) {
            logger.info(`Creating local channel ${name}`);
            channel = this.channels[name] = new Channel(name,
                    new Publisher(this.redisClient, name + ':q', name + ':c', 20),
                    this.nodeID);
            channel.on('empty', this.onChannelEmpty.bind(this, channel));
        }

        socket.channel = channel;
        channel.onSocketJoin(socket);
    }

    onChannelEmpty(channel) {
        if (channel.sockets.length > 0) {
            logger.warn(`onChannelEmpty called for channel "${channel.name}" ` +
                    `with ${channel.sockets.length} sockets remaining.  Ignoring.`);
            return;
        }

        logger.info(`Removing channel ${channel.name}`);
        delete this.channels[channel.name];
    }
}
