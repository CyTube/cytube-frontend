import { formatWebsocketAddress } from 'cytube-common/lib/util/addressutil';

export default class FrontendConfiguration {
    constructor(config) {
        this.config = this.preprocess(config);
    }

    isTrustedProxy(ip) {
        return this.config.web.trustProxy.indexOf(ip) >= 0;
    }

    getListenerConfig() {
        return this.config.web.listeners;
    }

    getProcessCount() {
        return this.config.processCount;
    }

    getKnexConfig() {
        return this.config.database;
    }

    getRedisConfig() {
        return this.config.redis;
    }

    getCookieSecret() {
        return this.config.web.cookieSecret;
    }

    getTLSConfig() {
        return this.config.web.tls;
    }

    preprocess(config) {
        config.web.listeners.forEach(listener => {
            if (!listener.clientAddress) {
                listener.clientAddress = formatWebsocketAddress(
                        listener.host,
                        listener.port,
                        listener.tls
                );
            }
        });

        return config;
    }
}
