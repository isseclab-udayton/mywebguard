'use strict'

function myWebGuard () {
  const builtins = {
    URL: URL,
    Date: Date,
    Error: Error,
    Promise: Promise,
    setTimeout: setTimeout,
    parseJson: JSON.parse,
    stringify: JSON.stringify,
    window: window,
    sessionStorage: window.sessionStorage,
    apply: Function.prototype.apply,
    defineProperty: Object.defineProperty,
    hasOwnProperty: Object.prototype.hasOwnProperty,
    getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor,
  }
  let cache = { codeOriginList: [] }
  const rules = builtins.parseJson(window.atob('JSON_RULES'))
  const utils = {
    printVerbose: function () {
      console.log('[MyWebGuard]', ...arguments)
    },
    getTopOrigin: function () {
      let url
      try {
        url = builtins.window.top.origin
      } catch {
        url = builtins.window.origin
      }
      return this.getOrigin(url)
    },
    getOrigin: function (url) {
      try {
        return new builtins.URL(url).hostname
      } catch {
        return null
      }
    },
    isCrossOrigin: function (origin) {
      try {
        return this.getTopOrigin() !== origin
      } catch {
        return false
      }
    },
    isUrlCrossOrigin: function (url) {
      try {
        return this.getTopOrigin() !== this.getOrigin(url)
      } catch {
        return false
      }
    },
    sleep: function (ms) {
      const start = new builtins.Date()
      let current = null
      do {
        current = new builtins.Date()
      }
      while (current - start < ms)
    },
  }
  const storage = {
    sessionStorage: {
      mutex: {
        MUTEX_KEY: 'MyWebGuard_Mutex',
        MUTEX_VALUE: '1',
        lock: function () {
          let mutex
          while (true) {
            mutex = builtins.sessionStorage.getItem(this.MUTEX_KEY)
            if (mutex !== this.MUTEX_VALUE)
              break
            utils.sleep(20)
          }
          builtins.sessionStorage.setItem(this.MUTEX_KEY, this.MUTEX_VALUE)
        },
        unlock: function () {
          builtins.sessionStorage.removeItem(this.MUTEX_KEY)
        },
      },
      DATA_KEY: 'MyWebGuard_Data',
      getCodeOriginList: function () {
        const json = builtins.sessionStorage.getItem(this.DATA_KEY)
        return json == null ? [utils.getTopOrigin()] : builtins.parseJson(
          json)
      },
      addCodeOrigin: function (origin) {
        let codeOriginList = cache.codeOriginList

        if (!(origin in codeOriginList)) {
          this.mutex.lock()
          codeOriginList = this.getCodeOriginList()
          codeOriginList.push(origin)
          codeOriginList = Array.from(new Set(codeOriginList))
          const json = builtins.stringify(codeOriginList)
          builtins.sessionStorage.setItem(this.DATA_KEY, json)
          this.mutex.unlock()

          cache.codeOriginList = codeOriginList
        }
      },
    },
  }
  const monitor = {
    method: function (object, methodName, policy) {
      while (!builtins.hasOwnProperty.call(object, methodName) &&
      object.__proto__)
        object = object.__proto__
      if (object === null) {
        throw new Error('Failed to find function for alias ' + methodName)
      }
      const method = object[methodName]
      if (method === null || method === undefined)
        throw new Error('No method ' + methodName + ' found for ' + object)

      method.apply = builtins.apply
      object[methodName] = function () {
        const obj = this
        const args = arguments
        const proceed = function () {
          return method.apply(obj, args)
        }
        return policy(obj, args, proceed)
      }
    },
    property: function (prototype, propertyName, policies) {
      while (!builtins.hasOwnProperty.call(prototype, propertyName) &&
      prototype.__proto__)
        prototype = prototype.__proto__
      if (prototype === null) {
        throw new Error('Failed to find function for alias ' + propertyName)
      }
      const descriptor = builtins.getOwnPropertyDescriptor(prototype,
        propertyName)
      if (descriptor === null || descriptor === undefined)
        throw new Error(
          'No descriptor ' + propertyName + ' found for ' + prototype)

      const wrapper = {
        get: function () {
          const obj = this
          const args = arguments
          const proceed = function () {
            return descriptor.get.call(obj)
          }
          if (!builtins.hasOwnProperty.call(policies, 'get'))
            return proceed()
          return policies.get(obj, args, proceed)

        },
        set: function () {
          const obj = this
          const args = arguments
          const proceed = function () {
            return descriptor.set.call(obj, args[0])
          }
          if (!builtins.hasOwnProperty.call(policies, 'set'))
            return proceed()
          return policies.set(obj, args, proceed)
        },
      }

      for (let key in ['configurable', 'enumerable', 'writable']) {
        if (builtins.hasOwnProperty.call(descriptor, key)) {
          wrapper[key] = descriptor[key]
        }
      }
      builtins.defineProperty(prototype, propertyName, wrapper)
    },
    getCodeOrigin: function () {
      const urls = new builtins.Error().stack.match(/https?:\/\/[^:]+/g)
      if (urls != null) {
        const origin = utils.getOrigin(urls[urls.length - 1])
        storage.sessionStorage.addCodeOrigin(origin)
        return origin
      }
      return undefined
    },
    isOriginBlocked: function (origin) {
      try {
        if (origin in rules.origins)
          return rules.origins[origin]
        return true
      } catch {
        return false
      }
    },
  }

  builtins.Error.stackTraceLimit = Infinity
  utils.printVerbose('myWebGuard is running in', location.href)

  monitor.property(HTMLImageElement.prototype, 'src', {
    set: function (obj, args, proceed) {
      const val = args[0]
      if (!utils.isUrlCrossOrigin(val))
        return proceed()

      const codeOrigin = monitor.getCodeOrigin()
      if (!monitor.isOriginBlocked(codeOrigin))
        return proceed()

      utils.printVerbose('[HTMLImageElement.prototype.src]', codeOrigin)
    },
  })
  monitor.property(HTMLScriptElement.prototype, 'src', {
    set: function (obj, args, proceed) {
      const val = args[0]
      if (!utils.isUrlCrossOrigin(val))
        return proceed()

      const codeOrigin = monitor.getCodeOrigin()
      if (!monitor.isOriginBlocked(codeOrigin))
        return proceed()

      utils.printVerbose('[HTMLScriptElement.prototype.src]', codeOrigin)
    },
  })
  monitor.property(Element.prototype, 'innerHTML', {
    set: function (obj, args, proceed) {
      const codeOrigin = monitor.getCodeOrigin()
      if (!monitor.isOriginBlocked(codeOrigin))
        return proceed()

      utils.printVerbose('[Element.prototype.innerHTML]', codeOrigin)
    },
  })
  monitor.method(Element.prototype, 'setAttribute',
    function (obj, args, proceed) {
      let block = false
      try {
        const key = args[0].toString()
        const val = args[1].toString()
        if (key.toLowerCase() === 'src' && utils.isUrlCrossOrigin(val)) {
          const codeOrigin = monitor.getCodeOrigin()
          if (monitor.isOriginBlocked(codeOrigin)) {
            block = true
            utils.printVerbose('[Element.prototype.setAttribute]', codeOrigin)
          }
        }
      } catch {
      }
      if (!block) {
        return proceed()
      }
    })
  monitor.method(Element.prototype, 'appendChild',
    function (obj, args, proceed) {
      const codeOrigin = monitor.getCodeOrigin()
      if (!monitor.isOriginBlocked(codeOrigin))
        return proceed()

      utils.printVerbose('[Element.prototype.appendChild]', codeOrigin)
    })
  monitor.method(document, 'createElement', function (obj, args, proceed) {
    const codeOrigin = monitor.getCodeOrigin()
    if (!monitor.isOriginBlocked(codeOrigin)) {
      return proceed()
    }

    utils.printVerbose('[document.createElement]', codeOrigin)
  })
  monitor.method(XMLHttpRequest.prototype, 'open',
    function (obj, args, proceed) {
      const codeOrigin = monitor.getCodeOrigin()
      let block = false
      try {
        const val = args[1].toString()
        if (utils.isCrossOrigin(val)) {
          if (monitor.isOriginBlocked(codeOrigin)) {
            block = true
          }
        }
      } catch {
      }
      if (!block) {
        return proceed()
      }
      utils.printVerbose('[XMLHttpRequest.prototype.open]', codeOrigin)
    })
  monitor.method(Node.prototype, 'insertBefore', function (obj, args, proceed) {
    const codeOrigin = monitor.getCodeOrigin()
    if (!monitor.isOriginBlocked(codeOrigin)) {
      return proceed()
    }
    utils.printVerbose('[Node.prototype.insertBefore]', codeOrigin)
  })
}