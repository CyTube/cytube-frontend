import redis from 'redis';
import Promise from 'bluebird';
Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);

export default class RedisClientFactory {
    constructor(redisConfig) {
        this.redisConfig = redisConfig;
    }

    create() {
        const client = redis.createClient({
            host: this.redisConfig.getHost(),
            port: this.redisConfig.getPort(),
            retry_max_delay: this.redisConfig.getMaxReconnectDelay()
        });

        client.on('error', this._defaultErrorHandler.bind(this));
        return client;
    }

    _defaultErrorHandler(err) {
        console.error(`Redis client threw error: ${err}`);
    }
}
