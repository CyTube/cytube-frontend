import logger from '../logger';

export default class ChannelManager {
    constructor() {
        this.channels = {};
    }

    onSocketJoinChannel(socket, name) {
        let channel = this.channels[name];
        if (!channel) {
            logger.info(`Creating local channel ${name}`);
            // TODO: actually create the channel
        }
    }
}
