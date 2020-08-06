'use strict'

let isTopFrame
let isInIFrame
let topOrigin
try {
  topOrigin = new URL(window.top.origin).hostname
  isTopFrame = window === window.top
  isInIFrame = false
} catch {
  topOrigin = new URL(window.origin).hostname
  isTopFrame = false
  isInIFrame = true
}
let cache = {}
const utils = {
  printVerbose: function () {
    console.log('[MyWebGuard]', ...arguments)
  },
  getOrigin: function (url) {
    try {
      return new URL(url).hostname
    } catch {
      return null
    }
  },
  sleep: function (ms) {
    const start = new Date()
    let current = null
    do {
      current = new Date()
    }
    while (current - start < ms)
  },
  sleepAsync: function (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  },
  promisify: function (thisArg, fnName) {
    const fn = thisArg[fnName]
    return function () {
      return new Promise((resolve, reject) => {
        fn.call(thisArg, ...arguments, function () {
          const lastError = chrome.runtime.lastError
          if (lastError instanceof Object) {
            return reject(lastError.message)
          }
          resolve(...arguments)
        })
      })
    }
  },
  getDefaultRules: function () {
    let rules = {
      origins: {},
    }
    rules.origins[topOrigin] = false
    return rules
  },
}
const apis = {
  chromeStorage: {
    getItem: async function (key) {
      let bin
      try {
        bin = await utils.promisify(chrome.storage.local, 'get')(key)
      } catch (ex) {
      }
      return bin instanceof Object ? bin[key] : null
    },
    setItem: async function (key, value) {
      let bin = {}
      bin[key] = value
      await utils.promisify(chrome.storage.local, 'set')(bin)
    },
    removeItem: async function (key) {
      await utils.promisify(chrome.storage.local, 'remove')(key)
    },
  },
}
const storage = {
  sessionStorage: {
    mutex: {
      MUTEX_KEY: 'MyWebGuard_Mutex',
      unlock: function () {
        window.sessionStorage.removeItem(this.MUTEX_KEY)
      },
    },
    DATA_KEY: 'MyWebGuard_Data',
    getChangedCodeOriginList: function () {
      const json = window.sessionStorage.getItem(this.DATA_KEY)
      if (cache.getChangedCodeOriginList !== undefined &&
        cache.getChangedCodeOriginList === json) {
        return null
      }
      cache.getChangedCodeOriginList = json
      return json == null ? [topOrigin] : JSON.parse(json)
    },
  },
  chromeLocal: {
    mutex: {
      MUTEX_KEY: 'mutex:' + topOrigin,
      MUTEX_VALUE: '1',
      lock: async function () {
        while (true) {
          let mutex = await apis.chromeStorage.getItem(this.MUTEX_KEY)
          if (mutex !== this.MUTEX_VALUE)
            break
          utils.sleep(20)
        }
        await apis.chromeStorage.setItem(this.MUTEX_KEY, this.MUTEX_VALUE)
      },
      unlock: async function () {
        await apis.chromeStorage.removeItem(this.MUTEX_KEY)
      },
    },
    RULES_KEY: 'rules:' + topOrigin,
    getRules: async function () {
      const json = await apis.chromeStorage.getItem(this.RULES_KEY)
      return json == null ? utils.getDefaultRules() : JSON.parse(json)
    },
    addOriginRule: async function (codeOrigin, isBLocked) {
      await this.mutex.lock()
      let rules = await this.getRules()
      rules.origins[codeOrigin] = isBLocked
      const json = JSON.stringify(rules)
      await apis.chromeStorage.setItem(this.RULES_KEY, json)
      await this.mutex.unlock()
    },
  },
};

(async () => {
  if (isInIFrame) {
    document.documentElement.innerHTML = ''
    utils.printVerbose('Removed iframe:', topOrigin)
  } else {
    storage.sessionStorage.mutex.unlock()
    await storage.chromeLocal.mutex.unlock(topOrigin)
    const rules = await storage.chromeLocal.getRules()
    let json = JSON.stringify(rules)
    const injectScript = document.createElement('script')
    let rawCode = '(' + myWebGuard.toString() + ')();'
    injectScript.innerHTML = rawCode.replace('JSON_RULES', window.btoa(json))
    document.documentElement.insertBefore(injectScript,
      document.documentElement.childNodes[0])
  }
})()

if (isTopFrame) {
  (async () => {
    utils.printVerbose('Service is running in', location.href)
    while (true) {
      await utils.sleepAsync(300)

      try {
        const codeOriginList = storage.sessionStorage.getChangedCodeOriginList()
        if (codeOriginList === null)
          continue
        const rules = await storage.chromeLocal.getRules()
        for (let i = 0; i < codeOriginList.length; i++) {
          const codeOrigin = codeOriginList[i]
          if (!(codeOrigin in rules.origins)) {
            await storage.chromeLocal.addOriginRule(codeOrigin, true)
          }
        }
      } catch (ex) {
        utils.printVerbose('Error in service:', ex.message)
        break
      }
    }
  })()
}