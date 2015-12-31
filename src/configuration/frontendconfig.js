export default class FrontendConfiguration {
    constructor(config) {
        this.config = config;
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
}
