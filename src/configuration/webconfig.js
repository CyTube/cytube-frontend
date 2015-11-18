export default class WebConfiguration {
    constructor(config) {
        this.config = config;
    }

    isTrustedProxy(ip) {
        return this.config.trustProxy.indexOf(ip) >= 0;
    }
}
