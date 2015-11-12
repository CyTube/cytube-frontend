export default class RedisConfiguration {
    constructor(config) {
        this.config = config;
    }

    getHost() {
        return this.config.host;
    }

    getPort() {
        return this.config.port;
    }

    getMaxReconnectDelay() {
        return this.config.maxReconnectDelay;
    }
}
