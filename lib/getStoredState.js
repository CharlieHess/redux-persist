'use strict';

exports.__esModule = true;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

exports.default = getStoredState;

var _constants = require('./constants');

var _asyncLocalStorage = require('./defaults/asyncLocalStorage');

var _asyncLocalStorage2 = _interopRequireDefault(_asyncLocalStorage);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function getStoredState(config, onComplete) {
  var storage = config.storage || (0, _asyncLocalStorage2.default)('local');
  var deserializer = config.serialize === false ? function (data) {
    return data;
  } : defaultDeserializer;
  var blacklist = config.blacklist || [];
  var whitelist = config.whitelist || false;
  var transforms = config.transforms || [];
  var keyPrefix = config.keyPrefix !== undefined ? config.keyPrefix : _constants.KEY_PREFIX;
  var asyncTransforms = config.asyncTransforms || false;

  // fallback getAllKeys to `keys` if present (LocalForage compatability)
  if (storage.keys && !storage.getAllKeys) storage = _extends({}, storage, { getAllKeys: storage.keys });

  var restoredState = {};
  var completionCount = 0;

  storage.getAllKeys(function (err, allKeys) {
    if (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('redux-persist/getStoredState: Error in storage.getAllKeys');
      }
      complete(err);
    }

    var persistKeys = allKeys.filter(function (key) {
      return key.indexOf(keyPrefix) === 0;
    }).map(function (key) {
      return key.slice(keyPrefix.length);
    });
    var keysToRestore = persistKeys.filter(passWhitelistBlacklist);

    var restoreCount = keysToRestore.length;
    if (restoreCount === 0) complete(null, restoredState);

    keysToRestore.forEach(function (key) {
      storage.getItem(createStorageKey(key), function (err, serialized) {
        function onKeyRehydrated() {
          completionCount += 1;
          if (completionCount === restoreCount) {
            complete(null, restoredState);
          }
        }

        if (err && process.env.NODE_ENV !== 'production') {
          console.warn('redux-persist/getStoredState: Error restoring data for key:', key, err);
        } else {
          rehydrate(restoredState, key, serialized, onKeyRehydrated);
        }
      });
    });
  });

  function rehydrate(restoredState, key, serialized, onKeyRehydrated) {
    function onRehydrateError(err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('redux-persist/getStoredState: Error restoring data for key:', key, err);
      }
      restoredState[key] = null;
    }

    var data = void 0;
    try {
      data = deserializer(serialized);
    } catch (err) {
      onRehydrateError(err);
      onKeyRehydrated();
      return;
    }

    if (asyncTransforms) {
      transforms.reduceRight(function (promise, transformer) {
        return promise.then(function () {
          return Promise.resolve(transformer.out(data, key)).then(function (transformed) {
            data = transformed;
            return data;
          });
        }).catch(onRehydrateError);
      }, Promise.resolve()).then(function (result) {
        restoredState[key] = result;
        onKeyRehydrated();
      });
    } else {
      try {
        restoredState[key] = transforms.reduceRight(function (subState, transformer) {
          return transformer.out(subState, key);
        }, data);
      } catch (err) {
        onRehydrateError(err);
      } finally {
        onKeyRehydrated();
      }
    }
  }

  function complete(err, restoredState) {
    onComplete(err, restoredState);
  }

  function passWhitelistBlacklist(key) {
    if (whitelist && whitelist.indexOf(key) === -1) return false;
    if (blacklist.indexOf(key) !== -1) return false;
    return true;
  }

  function createStorageKey(key) {
    return '' + keyPrefix + key;
  }

  if (typeof onComplete !== 'function' && !!Promise) {
    return new Promise(function (resolve, reject) {
      onComplete = function onComplete(err, restoredState) {
        if (err) reject(err);else resolve(restoredState);
      };
    });
  }
}

function defaultDeserializer(serial) {
  return JSON.parse(serial);
}