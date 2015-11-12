export default class Publisher {
    constructor(redisClient, queueName, channelName) {
        this.redisClient = redisClient;
        this.queueName = queueName;
        this.channelName = channelName;
    }

    publish(message) {
        const time = Date.now();
        const data = JSON.stringify({
            time: time,
            payload: message
        });

        return this.redisClient.multi()
                .rpush(this.queueName, data)
                .publish(this.channelName, String(time))
                .execAsync();
    }
}
