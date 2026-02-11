export class BasePrepare {
    multiProvider;
    metadata;
    log;
    rules = [];
    constructor(multiProvider, metadata, log, rulesConfig) {
        this.multiProvider = multiProvider;
        this.metadata = metadata;
        this.log = log;
        if (rulesConfig)
            this.rules = this.buildRules(rulesConfig);
    }
    create() {
        return async (parsedArgs, originChainName, blockNumber) => {
            // Evaluate rules before prepare
            const rulesResult = await this.evaluateRules(parsedArgs);
            if (!rulesResult.success) {
                this.log.error({
                    msg: "Rules validation failed",
                    orderId: parsedArgs.orderId,
                    error: rulesResult.error,
                });
                return { shouldFill: false };
            }
            // Call solver-specific prepare logic
            return this.prepare(parsedArgs, originChainName, blockNumber);
        };
    }
    async evaluateRules(parsedArgs) {
        let result = { success: true, data: "No rules" };
        for (const rule of this.rules) {
            result = await rule(parsedArgs, this);
            if (!result.success) {
                break;
            }
        }
        return result;
    }
    buildRules({ base = [], custom, }) {
        const customRules = [];
        if (this.metadata.customRules?.rules.length) {
            if (!custom) {
                throw new Error("Custom rules are specified in metadata, but no corresponding rule functions were provided.");
            }
            for (let i = 0; i < this.metadata.customRules.rules.length; i++) {
                const rule = this.metadata.customRules.rules[i];
                const ruleFn = custom[rule.name];
                if (!ruleFn) {
                    throw new Error(`Custom rule "${rule.name}" is specified in metadata but is not provided in the custom rules configuration.`);
                }
                customRules.push(ruleFn(rule.args));
            }
        }
        const keepBaseRules = this.metadata.customRules?.keepBaseRules ?? true;
        return keepBaseRules ? [...base, ...customRules] : customRules;
    }
}
//# sourceMappingURL=BasePrepare.js.map