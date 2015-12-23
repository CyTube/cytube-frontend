import Promise from 'bluebird';

export default class ChannelConnectionResolver {
    constructor(redisClient) {
        this.redisClient = redisClient;
    }

    resolve(channel) {
        // TODO: Implement Redis lua script for resolving/assigning channel
        return Promise.resolve('127.0.0.1:4037');
    }
}
