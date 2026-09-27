"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var utils = _interopRequireWildcard(require("./utils.js"));
var _intlMessageformat = _interopRequireDefault(require("intl-messageformat"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function _getRequireWildcardCache() { return cache; }; return cache; }
function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || _typeof(obj) !== "object" && typeof obj !== "function") { return { "default": obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj["default"] = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }
function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }
function _iterableToArrayLimit(arr, i) { if (typeof Symbol === "undefined" || !(Symbol.iterator in Object(arr))) return; var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }
function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }
function _typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }
function getDefaults() {
  return {
    memoize: true,
    memoizeFallback: false,
    bindI18n: '',
    bindI18nStore: '',
    parseErrorHandler: function parseErrorHandler(err, key, res, options) {
      return res;
    },
    parseLngForICU: function parseLngForICU(lng) {
      return lng;
    },
    escapeVariables: false
  };
}
var ICU = /*#__PURE__*/function () {
  function ICU(options) {
    _classCallCheck(this, ICU);
    this.type = 'i18nFormat';
    this.mem = {};
    this.init(null, options);
  }
  _createClass(ICU, [{
    key: "init",
    value: function init(i18next, options) {
      var _this = this;
      var i18nextOptions = i18next && i18next.options && i18next.options.i18nFormat || {};
      this.options = utils.defaults(i18nextOptions, options, this.options || {}, getDefaults());
      this.formats = this.options.formats;
      if (i18next) {
        var _this$options = this.options,
          bindI18n = _this$options.bindI18n,
          bindI18nStore = _this$options.bindI18nStore,
          memoize = _this$options.memoize;
        i18next.IntlMessageFormat = _intlMessageformat["default"];
        i18next.ICU = this;
        if (memoize) {
          if (bindI18n) {
            i18next.on(bindI18n, function () {
              return _this.clearCache();
            });
          }
          if (bindI18nStore) {
            i18next.store.on(bindI18nStore, function () {
              return _this.clearCache();
            });
          }
        }
      }
    }
  }, {
    key: "addUserDefinedFormats",
    value: function addUserDefinedFormats(formats) {
      this.formats = this.formats ? _objectSpread(_objectSpread({}, this.formats), formats) : formats;
    }
  }, {
    key: "parse",
    value: function parse(res, options, lng, ns, key, info) {
      var hadSuccessfulLookup = info && info.resolved && info.resolved.res;
      var memKey = this.options.memoize && "".concat(lng, ".").concat(ns, ".").concat(key.replace(/\./g, '###'));
      var fc;
      if (this.options.memoize) {
        fc = utils.getPath(this.mem, memKey);
      }
      try {
        if (!fc) {
          var transformedLng = this.options.parseLngForICU(lng);
          // without ignoreTag, react-i18next <Trans> translations with <0></0> placeholders
          // will fail to parse, as IntlMessageFormat expects them to be defined in the
          // options passed to fc.format() as { 0: (children) => string }
          // but the replacement of placeholders is done in react-i18next
          fc = new _intlMessageformat["default"](res, transformedLng, this.formats, {
            ignoreTag: true
          });
          if (this.options.memoize && (this.options.memoizeFallback || !info || hadSuccessfulLookup)) utils.setPath(this.mem, memKey, fc);
        }
        return fc.format(this.escapeVariableValues(options));
      } catch (err) {
        return this.options.parseErrorHandler(err, key, res, options);
      }
    }
  }, {
    key: "addLookupKeys",
    value: function addLookupKeys(finalKeys, _key, _code, _ns, _options) {
      // no additional keys needed for select or plural
      // so there is no need to add keys to that finalKeys array
      return finalKeys;
    }
  }, {
    key: "clearCache",
    value: function clearCache() {
      this.mem = {};
    }
  }, {
    key: "escapeVariableValues",
    value: function escapeVariableValues(options) {
      if (!this.options.escapeVariables || !options || _typeof(options) !== 'object') {
        return options;
      }
      var escaped = {};
      for (var _i = 0, _Object$entries = Object.entries(options); _i < _Object$entries.length; _i++) {
        var _Object$entries$_i = _slicedToArray(_Object$entries[_i], 2),
          key = _Object$entries$_i[0],
          value = _Object$entries$_i[1];
        if (typeof value === 'string') {
          // Escape HTML special characters that could interfere with ICU parsing
          escaped[key] = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        } else {
          escaped[key] = value;
        }
      }
      return escaped;
    }
  }]);
  return ICU;
}();
ICU.type = 'i18nFormat';
var _default = ICU;
exports["default"] = _default;