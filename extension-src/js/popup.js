'use strict';

(async () => {
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
    chromeTabs: {
      getSelected: async function () {
        const tabs = await utils.promisify(chrome.tabs, 'query')({
          'active': true,
          'currentWindow': true,
        })
        if (tabs.length === 0)
          return undefined
        return new URL(tabs[0].url).origin
      },
    },
  }
  const topOrigin = utils.getOrigin(await apis.chromeTabs.getSelected())
  if (topOrigin === null)
    return
  const storage = {
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
  }

  let rules = await storage.chromeLocal.getRules()
  let dataSet = []
  Object.keys(rules.origins).forEach(function (origin) {
    dataSet.push([origin, rules.origins[origin]])
  })

  /* Create an array with the values of all the checkboxes in a column */
  $.fn.dataTable.ext.order['dom-checkbox'] = function (settings, col) {
    return this.api().
      column(col, { order: 'index' }).
      nodes().
      map(function (td, i) {
        return $('input', td).prop('checked') ? '1' : '0'
      })
  }
  $(document).ready(async function () {
    $('#tableRules').DataTable({
      data: dataSet,
      scrollY: '448px',
      scrollCollapse: true,
      info: false,
      paging: false,
      searching: false,
      columns: [
        null,
        { orderDataType: 'dom-checkbox' },
      ],
      columnDefs: [
        { className: 'text-center', targets: 1 },
      ],
      order: [[1, 'asc'], [0, 'asc']],
      createdRow: function (row, data, dataIndex, cells) {
        let checkForm = document.createElement('form')
        let div = document.createElement('div')
        div.className = 'form-check abc-checkbox abc-checkbox-success'
        let input = document.createElement('input')
        input.type = 'checkbox'
        input.className = 'form-check-input'
        input.id = data[0]
        input.name = data[0]
        if (data[1]) {
          input.setAttribute('checked', 'checked')
        }
        $(input).change(function () {
          storage.chromeLocal.addOriginRule(this.name, this.checked)
        })
        let label = document.createElement('label')
        label.setAttribute('for', data[0])
        label.className = 'form-check-label'
        cells[1].innerHTML = ''
        cells[1].appendChild(checkForm)
        checkForm.appendChild(div)
        div.appendChild(input)
        div.appendChild(label)
      },
    })
  })
})()

