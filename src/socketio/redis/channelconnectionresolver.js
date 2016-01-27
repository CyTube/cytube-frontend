import { runLuaScript } from 'cytube-common/lib/redis/lualoader';
import path from 'path';
import Promise from 'bluebird';

const RESOLVE_CHANNEL = path.resolve(__dirname, 'resolve_channel.lua');

export default class ChannelConnectionResolver {
    constructor(redisClient) {
        this.redisClient = redisClient;
    }

    resolve(channel) {
        return runLuaScript(this.redisClient, RESOLVE_CHANNEL, [
            0,
            channel,
            this.hash(channel),
            Date.now() - 10000
        ]).then(result => {
            if (result === null) {
                throw new Error(`No available backend for ${channel}`);
            }

            return result;
        });
    }

    hash(str) {
        let h = 1;
        for (let i = 0; i < str.length; i++) {
            h += 31 * str.charCodeAt(i);
        }

        return h;
    }
}
