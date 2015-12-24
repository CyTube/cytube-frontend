import LuaLoader from 'cytube-common/lib/redis/lualoader';
import path from 'path';
import Promise from 'bluebird';

const RESOLVE_CHANNEL = LuaLoader(path.resolve(__dirname, 'resolve_channel.lua'))

export default class ChannelConnectionResolver {
    constructor(redisClient) {
        this.redisClient = redisClient;
    }

    resolve(channel) {
        // TODO: Use EVALSHA for efficiency
        return this.redisClient.evalAsync(RESOLVE_CHANNEL,
                0,
                channel,
                this.hash(channel),
                Date.now() - 10000
        );
    }

    hash(str) {
        let hash = 1;
        for (let i = 0; i < str.length; i++) {
            hash += 31 * str.charCodeAt(i);
        }

        return hash;
    }
}
