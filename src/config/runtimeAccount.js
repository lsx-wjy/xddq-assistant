import fileAccount from '../../account.js'

function loadRuntimeOverrides() {
    const encoded = process.env.XDDQ_RUNTIME_ACCOUNT
    if (!encoded) return null

    try {
        const json = Buffer.from(encoded, 'base64').toString('utf8')
        return JSON.parse(json)
    } catch (error) {
        throw new Error(`本地用户运行配置无效: ${error.message}`)
    }
}

const overrides = loadRuntimeOverrides()

const account = overrides
    ? {
        ...fileAccount,
        ...overrides,
        switch: { ...fileAccount.switch, ...overrides.switch },
        activities: { ...fileAccount.activities, ...overrides.activities },
            chopTree: {
                ...fileAccount.chopTree,
                ...overrides.chopTree,
                stop: { ...fileAccount.chopTree?.stop, ...overrides.chopTree?.stop },
                separation: { ...fileAccount.chopTree?.separation, ...overrides.chopTree?.separation },
                equipment: { ...fileAccount.chopTree?.equipment, ...overrides.chopTree?.equipment },
            },
    }
    : fileAccount

export default account
